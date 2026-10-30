"""Link-check evidence uses mocked DNS/sockets only; no live sites are probed."""
from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import socket
import ssl
import subprocess
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import check_information_sources as links
import world_sources

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, ('8.8.8.8', 443))]


def target(url='https://example.org/', *, allow_http=False):
    return {'url': url, 'allow_http': allow_http,
            'uses': [{'source_id': 'example', 'role': 'directory'}]}


def response(status=200, location=None, sample_bytes=0):
    return {'status': status, 'location': location, 'sample_bytes': sample_bytes}


def dns_result(rows):
    return SimpleNamespace(returncode=0, stdout=json.dumps(rows))


class LinkTests(unittest.TestCase):
    def setUp(self):
        # Even an accidentally unmocked code path must never use the network.
        self.addCleanup(patch.stopall)
        patch.object(socket, 'socket', side_effect=AssertionError('Live socket forbidden')).start()
        patch.object(socket, 'getaddrinfo', side_effect=AssertionError('Live DNS forbidden')).start()
        patch.object(subprocess, 'run', side_effect=AssertionError('Live DNS subprocess forbidden')).start()
        self.catalog = world_sources.load_catalog(ROOT)

    def test_catalog_targets_deduplicate_all_roles_and_skip_local_paths(self):
        targets, local = links.gather_targets(self.catalog)
        urls = [item['url'] for item in targets]
        self.assertEqual(len(urls), len(set(urls)))
        self.assertTrue({'/marx/', '/english/'} <= {item['url'] for item in local})
        self.assertEqual(len(local), 2)
        self.assertFalse(any(url.startswith('/') for url in urls))
        nature = next(item for item in targets if item['url'] == 'https://www.nature.com/')
        self.assertTrue({'directory', 'official_link', 'home_url'} <= {use['role'] for use in nature['uses']})
        feed_urls = {feed['feed_url'] for source in self.catalog['sources'] for feed in source['feeds']}
        self.assertTrue(feed_urls <= set(urls))
        self.assertTrue(all(item['url'].startswith('https:') or item['allow_http'] for item in targets))

    def test_draft_sources_and_draft_feeds_never_become_targets(self):
        data = deepcopy(self.catalog)
        source = next(source for source in data['sources'] if source['feeds'])
        source_id = source['id']
        source['status'] = 'draft'
        targets, _ = links.gather_targets(data)
        self.assertFalse(any(use['source_id'] == source_id for item in targets for use in item['uses']))
        source['status'] = 'approved'
        for feed in source['feeds']:
            feed['status'] = 'draft'
        targets, _ = links.gather_targets(data)
        self.assertFalse(any(use.get('feed_id') for item in targets for use in item['uses'] if use['source_id'] == source_id))

    def test_approved_disabled_feeds_are_still_checked_without_enabling_them(self):
        data = deepcopy(self.catalog)
        feed = next(source['feeds'][0] for source in data['sources'] if source['feeds'])
        feed['collect'] = False
        targets, _ = links.gather_targets(data)
        self.assertIn(feed['feed_url'], {item['url'] for item in targets})
        self.assertFalse(feed['collect'])

    def test_http_only_for_explicit_directory_not_rss_or_docs(self):
        self.assertEqual(links.validate_url('http://www.npc.gov.cn/', allow_http=True)[2], 80)
        for url in ['http://example.org/feed', 'file:///tmp/a', 'ftp://example.org/a']:
            with self.subTest(url=url), self.assertRaises(links.UnsafeTarget):
                links.validate_url(url)
        data = deepcopy(self.catalog)
        source = next(source for source in data['sources'] if source['feeds'])
        source['feeds'][0]['feed_url'] = 'http://example.org/feed'
        with self.assertRaises(links.UnsafeTarget):
            links.gather_targets(data)

    def test_reject_credentials_private_hosts_ports_and_parser_ambiguities(self):
        bad = ['https://user:password@example.org/', 'https://user@example.org/',
               'https://127.0.0.1/', 'https://10.0.0.1/', 'https://169.254.169.254/',
               'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://localhost/',
               'https://metadata.google.internal/', 'https://server.local/',
               'https://example.org:8443/', 'https://example.org:0/', 'https://example.org\\@127.0.0.1/',
               'https://%31%32%37.0.0.1/', 'https://example.org./',
               'https://example.org/\r\nHeader: injected', ' https://example.org/',
               'https://example.org/a b', 'https://[2001:4860::1%25eth0]/']
        for url in bad:
            with self.subTest(url=url), self.assertRaises(links.UnsafeTarget):
                links.validate_url(url)

    def test_normalize_safe_urls_and_public_literal_ips(self):
        self.assertEqual(links.validate_url('https://EXAMPLE.org:443#section')[0], 'https://example.org/')
        self.assertEqual(links.validate_url('https://8.8.8.8/')[1], '8.8.8.8')
        self.assertEqual(links.validate_url('https://[2001:4860:4860::8888]/')[1], '2001:4860:4860::8888')

    def test_dns_answers_are_bounded_and_all_must_be_public(self):
        good = [[socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, ['8.8.8.8', 443]]]
        private = [socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, ['10.0.0.1', 443]]
        with patch.object(subprocess, 'run', return_value=dns_result(good)) as resolve:
            self.assertEqual(links.resolve_public('example.org', 443, 1), PUBLIC)
        kwargs = resolve.call_args.kwargs
        self.assertEqual(kwargs['timeout'], 1)
        self.assertFalse(kwargs['shell'])
        self.assertEqual(resolve.call_args.args[0][-2:], ['example.org', '443'])
        for rows in [good + [private], [[socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, ['224.0.0.1', 443]]]]:
            with self.subTest(rows=rows), patch.object(subprocess, 'run', return_value=dns_result(rows)), self.assertRaises(links.UnsafeTarget):
                links.resolve_public('example.org', 443, 1)

    def test_dns_empty_bad_metadata_failure_and_hard_timeout(self):
        bad = [[], [[socket.AF_INET, socket.SOCK_STREAM, 0, ['8.8.8.8', 443]]],
               [[socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, ['8.8.8.8', 80]]]]
        for rows in bad:
            with self.subTest(rows=rows), patch.object(subprocess, 'run', return_value=dns_result(rows)), self.assertRaises(links.DNSFailure):
                links.resolve_public('example.org', 443, 1)
        with patch.object(subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='')), self.assertRaises(links.DNSFailure):
            links.resolve_public('example.org', 443, 1)
        with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('DNS', 1)), self.assertRaises(TimeoutError):
            links.resolve_public('example.org', 443, 1)

    def test_pinned_socket_uses_checked_sockaddr_without_second_dns(self):
        sock = MagicMock()
        with patch.object(socket, 'socket', return_value=sock):
            self.assertIs(links.open_checked_socket(PUBLIC, 2), sock)
        sock.connect.assert_called_once_with(('8.8.8.8', 443))
        sock.settimeout.assert_called_once()

    def test_tls_keeps_original_hostname_sni_and_default_verification(self):
        sock, wrapped, context = MagicMock(), MagicMock(), MagicMock()
        context.wrap_socket.return_value = wrapped
        with patch.object(links, 'open_checked_socket', return_value=sock), patch.object(ssl, 'create_default_context', return_value=context) as default:
            conn = links.PinnedConnection('example.org', 443, PUBLIC, 2, secure=True)
            conn.connect()
        default.assert_called_once_with()
        context.wrap_socket.assert_called_once_with(sock, server_hostname='example.org', do_handshake_on_connect=False)
        wrapped.do_handshake.assert_called_once_with()

    def test_head_observation_reads_no_body_and_disables_cookies_and_proxy_use(self):
        conn = MagicMock()
        conn.getresponse.return_value.status = 200
        conn.getresponse.return_value.getheader.return_value = None
        with patch.object(links, 'resolve_public', return_value=PUBLIC), patch.object(links, 'PinnedConnection', return_value=conn), patch.object(threading_module(), 'Timer'):
            result = links.request_once('https://example.org/', allow_http=False, method='HEAD', deadline=links.time.monotonic() + 10)
        self.assertEqual(result, response())
        conn.getresponse.return_value.read1.assert_not_called()
        headers = conn.request.call_args.kwargs['headers']
        self.assertNotIn('Cookie', headers)
        self.assertNotIn('Authorization', headers)
        self.assertNotIn('Proxy-Authorization', headers)
        self.assertEqual(headers['Accept-Encoding'], 'identity')
        conn.close.assert_called_once()

    def test_get_fallback_reads_at_most_one_kib_and_keeps_no_body(self):
        conn = MagicMock()
        conn.getresponse.return_value.status = 206
        conn.getresponse.return_value.getheader.return_value = None
        conn.getresponse.return_value.read1.return_value = b'limited bytes'
        with patch.object(links, 'resolve_public', return_value=PUBLIC), patch.object(links, 'PinnedConnection', return_value=conn), patch.object(threading_module(), 'Timer'):
            result = links.request_once('https://example.org/', allow_http=False, method='GET', deadline=links.time.monotonic() + 10)
        conn.getresponse.return_value.read1.assert_called_once_with(1024)
        self.assertEqual(conn.request.call_args.kwargs['headers']['Range'], 'bytes=0-1023')
        self.assertEqual(set(result), {'status', 'location', 'sample_bytes'})
        self.assertEqual(result['sample_bytes'], len(b'limited bytes'))

    def test_total_request_watchdog_interrupts_slow_streams(self):
        conn = MagicMock()
        callbacks = []
        def timer(timeout, callback):
            callbacks.append(callback)
            return MagicMock()
        def slow_response():
            callbacks[0]()
            raise OSError('Connection interrupted')
        conn.getresponse.side_effect = slow_response
        with patch.object(links, 'resolve_public', return_value=PUBLIC), patch.object(links, 'PinnedConnection', return_value=conn), patch.object(threading_module(), 'Timer', side_effect=timer), self.assertRaises(TimeoutError):
            links.request_once('https://example.org/', allow_http=False, method='HEAD', deadline=links.time.monotonic() + 10)
        conn.sock.shutdown.assert_called_once_with(socket.SHUT_RDWR)
        conn.close.assert_called_once()

    def test_already_expired_deadline_does_not_resolve_or_connect(self):
        with patch.object(links, 'resolve_public') as resolve, self.assertRaises(TimeoutError):
            links.request_once('https://example.org/', allow_http=False, method='HEAD', deadline=0)
        resolve.assert_not_called()

    def test_report_http_outcomes_never_calls_403_dead_or_fails_run(self):
        for status, outcome in [(200, 'ok'), (204, 'ok'), (206, 'ok'),
                                (401, 'restricted'), (403, 'restricted'), (429, 'restricted'),
                                (404, 'missing'), (410, 'missing'), (500, 'http-error'), (412, 'http-error')]:
            with self.subTest(status=status), patch.object(links, 'request_once', return_value=response(status)):
                result = links.check_target(target())
            self.assertEqual(result['outcome'], outcome)
            self.assertEqual(result['http_status'], status)
            if status == 403:
                self.assertIn('not a confirmed dead link', result['detail'])

    def test_only_405_and_501_trigger_bounded_get_fallback(self):
        for code in (405, 501):
            with self.subTest(code=code), patch.object(links, 'request_once', side_effect=[response(code), response(206, sample_bytes=10)]) as fetch:
                result = links.check_target(target())
            self.assertEqual([call.kwargs['method'] for call in fetch.call_args_list], ['HEAD', 'GET'])
            self.assertEqual(result['method'], 'GET')
            self.assertEqual(result['sample_bytes'], 10)
            self.assertEqual(result['outcome'], 'ok')
        with patch.object(links, 'request_once', return_value=response(403)) as fetch:
            links.check_target(target())
        self.assertEqual(fetch.call_count, 1)

    def test_redirects_are_limited_to_three_and_relative_targets_work(self):
        with patch.object(links, 'request_once', side_effect=[response(302, '/one'), response(301, '/two'), response(307, '/three'), response()]) as fetch:
            result = links.check_target(target())
        self.assertEqual(result['outcome'], 'ok')
        self.assertEqual(len(result['redirects']), 3)
        self.assertEqual(result['final_url'], 'https://example.org/three')
        self.assertEqual(fetch.call_count, 4)
        with patch.object(links, 'request_once', side_effect=[response(302, f'/{i}') for i in range(4)]) as fetch:
            result = links.check_target(target())
        self.assertEqual(result['outcome'], 'redirect-limit')
        self.assertEqual(fetch.call_count, 4)

    def test_redirect_to_private_credential_or_https_downgrade_is_blocked_before_request(self):
        for url in ['https://127.0.0.1/', 'http://example.org/', 'https://name:secret@example.net/', '//10.0.0.1/', 'file:///private/a']:
            with self.subTest(url=url), patch.object(links, 'request_once', return_value=response(302, url)) as fetch:
                result = links.check_target(target())
            self.assertEqual(result['outcome'], 'blocked')
            self.assertEqual(fetch.call_count, 1)

    def test_every_redirect_hop_resolves_again_and_rejects_private_dns(self):
        conn = MagicMock()
        conn.getresponse.return_value.status = 302
        conn.getresponse.return_value.getheader.return_value = 'https://redirect.example.net/'
        with patch.object(links, 'resolve_public', side_effect=[PUBLIC, links.UnsafeTarget('DNS returned private address')]) as resolve, patch.object(links, 'PinnedConnection', return_value=conn), patch.object(threading_module(), 'Timer'):
            result = links.check_target(target())
        self.assertEqual(result['outcome'], 'blocked')
        self.assertEqual([call.args[0] for call in resolve.call_args_list], ['example.org', 'redirect.example.net'])

    def test_get_fallback_resolves_again_and_cannot_rebind_to_private_dns(self):
        conn = MagicMock()
        conn.getresponse.return_value.status = 405
        conn.getresponse.return_value.getheader.return_value = None
        with patch.object(links, 'resolve_public', side_effect=[PUBLIC, links.UnsafeTarget('DNS rebound to a private address')]) as resolve, patch.object(links, 'PinnedConnection', return_value=conn) as connection, patch.object(threading_module(), 'Timer'):
            result = links.check_target(target())
        self.assertEqual(result['outcome'], 'blocked')
        self.assertEqual(resolve.call_count, 2)
        self.assertEqual(connection.call_count, 1)

    def test_http_directory_upgrade_cannot_downgrade_again(self):
        with patch.object(links, 'request_once', side_effect=[response(302, 'https://example.org/'), response(302, 'http://example.org/back')]) as fetch:
            result = links.check_target(target('http://example.org/', allow_http=True))
        self.assertEqual(result['outcome'], 'blocked')
        self.assertEqual(fetch.call_count, 2)

    def test_redirect_loop_and_missing_location_are_distinct(self):
        with patch.object(links, 'request_once', return_value=response(302, '/')) as fetch:
            self.assertEqual(links.check_target(target())['outcome'], 'redirect-limit')
        self.assertEqual(fetch.call_count, 1)
        with patch.object(links, 'request_once', return_value=response(302)):
            self.assertEqual(links.check_target(target())['outcome'], 'http-error')

    def test_tls_timeout_dns_and_connection_failures_are_separate_report_rows(self):
        for error, outcome in [(ssl.SSLCertVerificationError('expired'), 'tls-error'),
                               (TimeoutError(), 'timeout'), (links.DNSFailure(), 'dns-error'),
                               (ConnectionRefusedError(), 'network-error')]:
            with self.subTest(outcome=outcome), patch.object(links, 'request_once', side_effect=error):
                result = links.check_target(target())
            self.assertEqual(result['outcome'], outcome)
            self.assertIsNone(result['http_status'])

    def test_parallel_report_uses_bounded_pool_and_does_not_change_catalog(self):
        before = deepcopy(self.catalog)
        targets, _ = links.gather_targets(self.catalog)
        with patch.object(links, 'check_target', side_effect=lambda item: dict(item, outcome='restricted')) as check:
            report = links.create_report(self.catalog)
        self.assertEqual(check.call_count, len(targets))
        self.assertEqual(report['counts']['restricted'], len(targets))
        self.assertEqual(report['limits']['workers'], 4)
        self.assertEqual(self.catalog, before)

    def test_cli_network_failures_write_reports_and_return_zero(self):
        with TemporaryDirectory() as temporary, patch.object(links, 'request_once', side_effect=TimeoutError()), redirect_stdout(io.StringIO()):
            output, summary = Path(temporary) / 'report.json', Path(temporary) / 'summary.md'
            self.assertEqual(links.main(['--output', str(output), '--summaryMarkdown', str(summary)]), 0)
            report = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(report['counts']['timeout'], report['unique_urls'])
            self.assertIn('not confirmed dead links', summary.read_text(encoding='utf-8'))
            self.assertNotIn('limited bytes', json.dumps(report))

    def test_bad_catalog_and_public_report_destination_fail_without_fetching(self):
        with TemporaryDirectory() as temporary, patch.object(world_sources, 'load_catalog', side_effect=ValueError('Invalid catalog')), patch.object(links, 'create_report') as create, redirect_stderr(io.StringIO()):
            self.assertEqual(links.main(['--output', str(Path(temporary) / 'report.json')]), 1)
        create.assert_not_called()
        with self.assertRaises(ValueError):
            links.report_path(ROOT / world_sources.CATALOG_PATH)
        with self.assertRaises(ValueError):
            links.report_path(ROOT / 'scripts/overwrite.py')

    def test_markdown_escapes_untrusted_error_text(self):
        with patch.object(links, 'request_once', return_value=response(403)):
            result = links.check_target(target())
        result['detail'] = '<script>bad</script>|new\nline'
        report = {'checked_at': '2026-10-31T00:00:00Z', 'approved_sources': 1, 'unique_urls': 1,
                  'counts': {'restricted': 1}, 'results': [result], 'skipped_local': []}
        summary = links.markdown_summary(report)
        self.assertNotIn('<script>', summary)
        self.assertIn('&lt;script&gt;', summary)
        self.assertIn('\\|new line', summary)

    def test_workflow_is_read_only_weekly_separate_and_has_no_publish_path(self):
        workflow = (ROOT / '.github/workflows/check-information-sources.yml').read_text(encoding='utf-8')
        self.assertIn("cron: '40 1 * * 1'", workflow)
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('contents: read', workflow)
        self.assertIn('persist-credentials: false', workflow)
        self.assertIn('timeout-minutes: 10', workflow)
        self.assertIn('$GITHUB_STEP_SUMMARY', workflow)
        self.assertNotIn('contents: write', workflow)
        for text in ['workflow_run:', 'upload-artifact', 'gh release', 'git push', 'pages', 'news_snapshot.py collect']:
            self.assertNotIn(text, workflow)


def threading_module():
    return links.threading


if __name__ == '__main__':
    unittest.main()
