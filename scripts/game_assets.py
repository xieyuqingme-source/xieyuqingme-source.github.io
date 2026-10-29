"""Explicit book artwork allowlist shared by the builder and learning Markdown."""

GAME_BOOK_ASSETS = (
    "book-pride-and-prejudice.webp", "book-jane-eyre.webp", "book-wuthering-heights.webp",
    "book-a-tale-of-two-cities.webp", "book-great-expectations.webp", "book-robinson-crusoe.webp",
    "book-gullivers-travels.webp", "book-frankenstein.webp", "book-alice-in-wonderland.webp",
    "book-treasure-island.webp", "book-sherlock-holmes.webp", "book-dorian-gray.webp",
    "book-moby-dick.webp", "book-tom-sawyer.webp", "book-huckleberry-finn.webp",
    "book-little-women.webp", "book-the-great-gatsby.webp", "book-hamlet.webp",
    "book-romeo-and-juliet.webp", "book-walden.webp",
)

LEARNING_IMAGE_PATHS = frozenset("/assets/books/" + name for name in GAME_BOOK_ASSETS)
