"""Regression checks for updating the publication block without altering its text."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import sync_inspire_publications as sync


class UpdatePageTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.page = Path(directory.name) / "academics.html"
        page_patch = patch.object(sync, "PAGE", self.page)
        page_patch.start()
        self.addCleanup(page_patch.stop)

    def test_preserves_title_text_and_only_replaces_publication_block(self):
        prefix = "<!doctype html>\n<main><h1>学术集</h1>\n"
        suffix = "\n</main><footer>CMC</footer>\n"
        original = prefix + sync.START + "\nOld publications\n" + sync.END + suffix
        titles = (
            (r"Limits on $\mu$", r"Limits on $\mu$"),
            (r"Limits on $\beta$ and $\theta$", r"Limits on $\beta$ and $\theta$"),
            (
                r'Limits on $\mu$ < 1 & "observations"',
                r"Limits on $\mu$ &lt; 1 &amp; &quot;observations&quot;",
            ),
        )
        for title, expected_title in titles:
            with self.subTest(title=title):
                self.page.write_text(original, encoding="utf-8")
                block = sync.render_block([
                    {"id": "123", "metadata": {"titles": [{"title": title}]}}
                ])

                self.assertTrue(sync.update_page(block))
                updated = self.page.read_text(encoding="utf-8")
                self.assertIn(f"<h3>{expected_title}</h3>", updated)
                self.assertEqual(updated, prefix + block + suffix)

                # A repeated sync must neither report a change nor rewrite the file.
                with patch.object(Path, "write_text") as write:
                    self.assertFalse(sync.update_page(block))
                    write.assert_not_called()
                self.assertEqual(self.page.read_text(encoding="utf-8"), updated)

    def test_missing_markers_leave_original_page_untouched(self):
        for markers in ("", sync.START, sync.END):
            with self.subTest(markers=markers):
                original = f"<main>Keep this content{markers}</main>\n"
                self.page.write_text(original, encoding="utf-8")

                with self.assertRaisesRegex(RuntimeError, "markers are missing"):
                    sync.update_page(sync.START + "Replacement" + sync.END)

                self.assertEqual(self.page.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
