"""Calculate archive header calendars in one optional local Node invocation."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import news_snapshot as news


def calendar_metadata(dates):
    dates = list(dict.fromkeys(dates))
    if not dates:
        return {}
    from datetime import date
    if len(dates) > 10000 or any(not isinstance(value, str) or date.fromisoformat(value).isoformat() != value for value in dates):
        raise ValueError('Archive calendars need valid bounded dates.')
    node = os.environ.get('NODE_BINARY') or shutil.which('node')
    if not node:
        return {}
    try:
        completed = subprocess.run([node, str(Path(__file__).with_suffix('.cjs'))],
                                   input=json.dumps(dates).encode('utf-8'), capture_output=True, timeout=120)
        if completed.returncode or len(completed.stdout) > 2 * 1024 * 1024:
            return {}
        data = news._json(completed.stdout)
        if not isinstance(data, dict) or set(data) != set(dates):
            return {}
        result = {}
        for day, values in data.items():
            if values is None:
                continue
            if not isinstance(values, dict) or set(values) != {'lunar', 'term', 'moon'}:
                return {}
            for value in values.values():
                news._text(value, 100)
            result[day] = values
        return result
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
        return {}
