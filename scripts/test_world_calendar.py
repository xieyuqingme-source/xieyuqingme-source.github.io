"""Real local calendar bridge and truthful missing-runtime fallback."""
from unittest.mock import patch
import subprocess
import unittest

from world_calendar import calendar_metadata


class ArchiveCalendarTests(unittest.TestCase):
    def test_real_beijing_calendar_phase_event_and_leap_day(self):
        result = calendar_metadata(['2026-10-26', '2026-06-21', '2028-02-29', '2026-10-26'])
        self.assertEqual(set(result), {'2026-10-26', '2026-06-21', '2028-02-29'})
        self.assertEqual(result['2026-10-26']['moon'], '满月')
        self.assertEqual(result['2026-06-21']['term'], '夏至')
        self.assertIn('年', result['2028-02-29']['lunar'])
        for item in result.values():
            self.assertEqual(set(item), {'lunar', 'term', 'moon'})

    def test_missing_node_does_not_fabricate_calendar_words(self):
        with patch('world_calendar.shutil.which', return_value=None), patch('world_calendar.os.environ', {}), patch('world_calendar.subprocess.run') as run:
            self.assertEqual(calendar_metadata(['2026-10-31']), {})
            run.assert_not_called()

    def test_bad_dates_rejected_before_a_process_runs(self):
        for value in ['2026-02-30', '../private', '2026-10-31T00:00:00Z']:
            with self.subTest(value=value), patch('world_calendar.subprocess.run') as run, self.assertRaises(ValueError):
                calendar_metadata([value])
            run.assert_not_called()

    def test_failed_or_timeout_batch_is_an_explicit_missing_metadata_result(self):
        with patch('world_calendar.shutil.which', return_value='node'), patch('world_calendar.subprocess.run', side_effect=subprocess.TimeoutExpired('node', 120)):
            self.assertEqual(calendar_metadata(['2026-10-31']), {})


if __name__ == '__main__':
    unittest.main()
