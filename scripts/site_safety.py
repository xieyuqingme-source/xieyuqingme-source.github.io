"""Shared private-path detection for public site data."""
import re

PRIVATE_PATH = re.compile(
    r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|Obsidian Vault|/(?:Users|home|mnt)/|file://",
    re.I,
)
