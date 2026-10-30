"""Report approved catalog link observations; never edit or disable a source.

Only directory URLs may explicitly use HTTP. Each request/redirect resolves and
checks public DNS addresses, then pins its socket to that checked answer. HTTPS
keeps certificate/hostname verification and SNI. No proxy, cookie, article link,
HTML parsing, or response body is retained. All network failures are report data.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import html
import http.client
import ipaddress
import json
from pathlib import Path
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

import world_sources

ROOT = Path(__file__).resolve().parent.parent
MAX_REDIRECTS = 3
MAX_WORKERS = 4
DNS_TIMEOUT = 3
REQUEST_TIMEOUT = 6
TARGET_TIMEOUT = 20
MAX_BODY_BYTES = 1024
MAX_URL_LENGTH = 2048
USER_AGENT = 'InformationSourceLinkCheck/1.0 (read-only catalog maintenance)'
REDIRECT_CODES = {301, 302, 303, 307, 308}
OUTCOMES = ('ok', 'restricted', 'missing', 'http-error', 'tls-error', 'timeout',
            'dns-error', 'blocked', 'redirect-limit', 'network-error')
# A subprocess bounds getaddrinfo itself (socket.settimeout does not bound DNS).
# Arguments are passed without a shell; only the child's JSON result is used.
DNS_SCRIPT = '''import json,socket,sys
rows=socket.getaddrinfo(sys.argv[1],int(sys.argv[2]),type=socket.SOCK_STREAM)
if len(rows)>64: raise ValueError("Too many DNS answers")
print(json.dumps([[int(r[0]),int(r[1]),r[2],list(r[4])] for r in rows]))
'''


class UnsafeTarget(ValueError):
    pass


class DNSFailure(OSError):
    pass


def public_address(value):
    """Reject private, local, multicast, documentation and reserved addresses."""
    address = ipaddress.ip_address(value)
    return (address.is_global and not address.is_multicast
            and not address.is_reserved and not address.is_unspecified)


def validate_url(value, *, allow_http=False):
    if (not isinstance(value, str) or not value or len(value) > MAX_URL_LENGTH
            or any(ord(char) <= 32 or ord(char) == 127 for char in value)
            or any(char in value for char in '\\<>"`')):
        raise UnsafeTarget('Malformed public URL.')
    try:
        parts = urlsplit(value)
        if parts.scheme not in ({'http', 'https'} if allow_http else {'https'}):
            raise UnsafeTarget('HTTPS is required outside explicit HTTP directory links.')
        if parts.username is not None or parts.password is not None or '@' in parts.netloc:
            raise UnsafeTarget('Credential URLs are not allowed.')
        host = (parts.hostname or '').encode('idna').decode('ascii').lower()
        port = parts.port if parts.port is not None else (443 if parts.scheme == 'https' else 80)
    except (ValueError, UnicodeError) as exc:
        raise UnsafeTarget('Malformed URL host or port.') from exc
    if not host or '%' in host or host.endswith('.'):
        raise UnsafeTarget('Malformed public hostname.')
    if port != (443 if parts.scheme == 'https' else 80):
        raise UnsafeTarget('Only standard HTTP/HTTPS ports are allowed.')
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        if (len(host) > 253 or '.' not in host
                or host.endswith(('.localhost', '.local', '.internal', '.lan', '.home',
                                  '.localdomain', '.test', '.invalid', '.onion'))
                or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label)
                       for label in host.split('.'))):
            raise UnsafeTarget('A public fully qualified hostname is required.')
    else:
        if not public_address(literal):
            raise UnsafeTarget('The URL points to a non-public address.')
    netloc = f'[{host}]' if ':' in host else host
    normalized = urlunsplit((parts.scheme, netloc, parts.path or '/', parts.query, ''))
    return normalized, host, port


def resolve_public(host, port, timeout):
    try:
        completed = subprocess.run([sys.executable, '-c', DNS_SCRIPT, host, str(port)],
                                   capture_output=True, text=True, timeout=timeout,
                                   check=False, shell=False)
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError('DNS resolution exceeded its time limit.') from exc
    if completed.returncode:
        raise DNSFailure('DNS resolution failed.')
    try:
        rows = json.loads(completed.stdout)
        if not isinstance(rows, list) or not 1 <= len(rows) <= 64:
            raise ValueError('Empty or oversized DNS answer.')
        checked = []
        for family, socktype, protocol, address in rows:
            if (family not in (socket.AF_INET, socket.AF_INET6)
                    or socktype != socket.SOCK_STREAM or protocol != socket.IPPROTO_TCP
                    or not isinstance(address, list)
                    or len(address) != (2 if family == socket.AF_INET else 4)
                    or address[1] != port):
                raise ValueError('Unexpected DNS socket metadata.')
            if not public_address(address[0]):
                raise UnsafeTarget('DNS returned at least one non-public address.')
            checked.append((family, socktype, protocol, tuple(address)))
        return checked
    except UnsafeTarget:
        raise
    except (ValueError, TypeError, IndexError) as exc:
        raise DNSFailure('Malformed DNS resolution result.') from exc


def open_checked_socket(addresses, timeout):
    """Use checked sockaddr tuples directly: never resolve a hostname again."""
    deadline = time.monotonic() + timeout
    error = OSError('No reachable public address.')
    for family, kind, protocol, address in addresses:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Public connection exceeded its time limit.')
        sock = socket.socket(family, kind, protocol)
        try:
            sock.settimeout(remaining)
            sock.connect(address)
            return sock
        except OSError as exc:
            error = exc
            sock.close()
    raise error


class PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, addresses, timeout, *, secure):
        super().__init__(host, port=port, timeout=timeout)
        self.addresses = addresses
        self.secure = secure

    def connect(self):
        deadline = time.monotonic() + self.timeout
        self.sock = open_checked_socket(self.addresses, self.timeout)
        if self.secure:
            # Leave verification enabled, including the original host's SNI.
            context = ssl.create_default_context()
            self.sock = context.wrap_socket(self.sock, server_hostname=self.host,
                                            do_handshake_on_connect=False)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Connection left no time for a TLS handshake.')
            self.sock.settimeout(remaining)
            self.sock.do_handshake()


def request_once(url, *, allow_http, method, deadline):
    normalized, host, port = validate_url(url, allow_http=allow_http)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Link observation exceeded its time limit.')
    addresses = resolve_public(host, port, min(DNS_TIMEOUT, remaining))
    timeout = min(REQUEST_TIMEOUT, deadline - time.monotonic())
    if timeout <= 0:
        raise TimeoutError('Link observation exceeded its time limit.')
    conn = PinnedConnection(host, port, addresses, timeout, secure=normalized.startswith('https:'))
    timed_out = threading.Event()

    def abort():
        timed_out.set()
        sock = conn.sock
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except (OSError, ValueError):
                pass

    # A total request timer also bounds slow headers or a slow streaming body.
    timer = threading.Timer(timeout, abort)
    timer.daemon = True
    timer.start()
    try:
        parts = urlsplit(normalized)
        path = parts.path + (('?' + parts.query) if parts.query else '')
        headers = {'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity',
                   'Connection': 'close', 'Accept': '*/*'}
        if method == 'GET':
            headers['Range'] = f'bytes=0-{MAX_BODY_BYTES - 1}'
        conn.request(method, path, headers=headers)
        response = conn.getresponse()
        # read1 performs one bounded buffer read; discard it, never parse HTML.
        sample_bytes = len(response.read1(MAX_BODY_BYTES)) if method == 'GET' else 0
        result = {'status': response.status, 'location': response.getheader('Location'),
                  'sample_bytes': sample_bytes}
        if timed_out.is_set():
            raise TimeoutError('HTTP observation exceeded its time limit.')
        return result
    except (OSError, http.client.HTTPException, ValueError) as exc:
        if timed_out.is_set():
            raise TimeoutError('HTTP observation exceeded its time limit.') from exc
        raise
    finally:
        timer.cancel()
        conn.close()


def gather_targets(catalog):
    """One URL can have many catalog uses; draft/local entries are not fetched."""
    targets, local = {}, {}

    def add(source, role, url, feed_id=None):
        use = {'source_id': source['id'], 'role': role}
        if feed_id:
            use['feed_id'] = feed_id
        if url in {'/english/', '/marx/'}:
            item = local.setdefault(url, {'url': url, 'uses': []})
            if use not in item['uses']:
                item['uses'].append(use)
            return
        allow_http = role in {'directory', 'official_link'} and url.startswith('http://')
        normalized, _, _ = validate_url(url, allow_http=allow_http)
        item = targets.setdefault(normalized, {'url': normalized, 'allow_http': allow_http, 'uses': []})
        item['allow_http'] = item['allow_http'] and allow_http
        if use not in item['uses']:
            item['uses'].append(use)

    for source in catalog['sources']:
        if source['status'] != 'approved':
            continue
        add(source, 'directory', source['url'])
        for link in source['official_links']:
            add(source, 'official_link', link['url'])
        for feed in source['feeds']:
            if feed['status'] != 'approved':
                continue
            for role in ('feed_url', 'home_url', 'docs_url'):
                add(source, role, feed[role], feed['id'])
    return list(targets.values()), list(local.values())


def check_target(target):
    started = time.monotonic()
    deadline = started + TARGET_TIMEOUT
    url = target['url']
    allow_http = target['allow_http']
    result = {'url': url, 'uses': target['uses'], 'final_url': url, 'outcome': None,
              'http_status': None, 'method': 'HEAD', 'redirects': [], 'sample_bytes': 0,
              'detail': ''}
    visited = set()
    try:
        for hop in range(MAX_REDIRECTS + 1):
            url, _, _ = validate_url(url, allow_http=allow_http)
            result['final_url'] = url
            result['http_status'] = None
            if url in visited:
                result.update(outcome='redirect-limit', detail='Redirect loop.')
                break
            visited.add(url)
            # A successful upgrade never grants permission to downgrade later.
            allow_http = allow_http and url.startswith('http://')
            result['method'] = 'HEAD'
            response = request_once(url, allow_http=allow_http, method='HEAD', deadline=deadline)
            if response['status'] in {405, 501}:
                result['method'] = 'GET'
                response = request_once(url, allow_http=allow_http, method='GET', deadline=deadline)
            status = response['status']
            result['http_status'] = status
            result['sample_bytes'] += response['sample_bytes']
            if status in REDIRECT_CODES:
                if hop == MAX_REDIRECTS:
                    result.update(outcome='redirect-limit', detail='More than three redirects.')
                    break
                location = response['location']
                if not location:
                    result.update(outcome='http-error', detail='Redirect omitted Location.')
                    break
                next_url = urljoin(url, location)
                # Validate before the next DNS query/connection, not afterwards.
                next_url, _, _ = validate_url(next_url, allow_http=allow_http)
                result['redirects'].append({'status': status, 'from': url, 'to': next_url})
                url = next_url
                continue
            if 200 <= status < 300:
                result['outcome'] = 'ok'
            elif status in {401, 403, 429}:
                result.update(outcome='restricted', detail='Access restricted; not a confirmed dead link.')
            elif status in {404, 410}:
                result['outcome'] = 'missing'
            else:
                result['outcome'] = 'http-error'
            break
    except UnsafeTarget as exc:
        result.update(outcome='blocked', detail=str(exc))
    except ssl.SSLError:
        result.update(outcome='tls-error', detail='TLS/certificate validation or handshake failed.')
    except (TimeoutError, subprocess.TimeoutExpired):
        result.update(outcome='timeout', detail='DNS, connection, or request time limit exceeded.')
    except (DNSFailure, socket.gaierror):
        result.update(outcome='dns-error', detail='Public DNS lookup failed.')
    except (OSError, http.client.HTTPException, ValueError):
        result.update(outcome='network-error', detail='Connection or HTTP protocol failed.')
    result['duration_ms'] = round((time.monotonic() - started) * 1000)
    return result


def create_report(catalog):
    targets, local = gather_targets(catalog)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        results = list(executor.map(check_target, targets))
    counts = Counter(item['outcome'] for item in results)
    return {'version': 1, 'checked_at': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'catalog': str(world_sources.CATALOG_PATH).replace('\\', '/'),
            'approved_sources': len(world_sources.approved_sources(catalog)),
            'unique_urls': len(targets), 'counts': {key: counts[key] for key in OUTCOMES},
            'limits': {'workers': MAX_WORKERS, 'max_redirects': MAX_REDIRECTS,
                       'dns_timeout_seconds': DNS_TIMEOUT, 'request_timeout_seconds': REQUEST_TIMEOUT,
                       'target_timeout_seconds': TARGET_TIMEOUT, 'max_get_bytes': MAX_BODY_BYTES},
            'skipped_local': local, 'results': results}


def markdown_summary(report):
    def clean(value):
        return html.escape(str(value)).replace('|', '\\|').replace('\n', ' ').replace('\r', ' ')

    lines = ['## Information source link observations', '',
             f'UTC: {report["checked_at"]} · approved sources: {report["approved_sources"]} · unique URLs: {report["unique_urls"]}', '',
             'Read-only report. A 2xx response does not verify page contents, full functionality, or access from other regions. ',
             '401/403/429 mean restricted access, not confirmed dead links. No sources are deleted or disabled. ',
             'Only catalog entry points and official subscription links are checked; article links are not followed.', '',
             '| Outcome | Count |', '| --- | ---: |']
    lines.extend(f'| {key} | {count} |' for key, count in report['counts'].items())
    lines.extend(['', '| Outcome | HTTP | Method | URL / final URL | Detail |', '| --- | ---: | --- | --- | --- |'])
    for item in report['results']:
        urls = clean(item['url'])
        if item['final_url'] != item['url']:
            urls += ' → ' + clean(item['final_url'])
        lines.append(f'| {item["outcome"]} | {item["http_status"] or "—"} | {item["method"]} | {urls} | {clean(item["detail"])} |')
    lines.extend(['', f'Local paths skipped (no HTTP request): {len(report["skipped_local"])}.', ''])
    return '\n'.join(lines)


def report_path(value):
    path = Path(value).resolve()
    if path.is_relative_to(ROOT) and not path.is_relative_to(ROOT / '.local-checks'):
        raise ValueError('Reports inside the repository must be under ignored .local-checks/.')
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / '.local-checks/information-source-links/report.json'))
    parser.add_argument('--summaryMarkdown', metavar='PATH', help='Optional Markdown report (for GITHUB_STEP_SUMMARY).')
    args = parser.parse_args(argv)
    try:
        output = report_path(args.output)
        summary = report_path(args.summaryMarkdown) if args.summaryMarkdown else None
        if summary == output:
            raise ValueError('JSON and Markdown reports need different paths.')
        catalog = world_sources.load_catalog(ROOT)
        report = create_report(catalog)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if summary:
            summary.parent.mkdir(parents=True, exist_ok=True)
            summary.write_text(markdown_summary(report), encoding='utf-8')
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f'Information link check configuration/report error: {exc}', file=sys.stderr)
        return 1
    print(f'Reported {report["unique_urls"]} unique approved URLs: {json.dumps(report["counts"], ensure_ascii=False)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
