"""Regression checks for updating the publication block without altering its text."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import sync_inspire_publications as sync


def publication(identifier):
    return {
        "id": str(identifier),
        "metadata": {"control_number": identifier, "titles": [{"title": f"Paper {identifier}"}]},
    }


def literature_page(hits, total, next_url=None):
    return {"hits": {"hits": hits, "total": total}, "links": {"next": next_url}}


class FetchPublicationsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.page = Path(directory.name) / "academics.html"
        self.original = "Before\n" + sync.START + "\nExisting publications\n" + sync.END + "\nAfter\n"
        self.page.write_text(self.original, encoding="utf-8")
        page_patch = patch.object(sync, "PAGE", self.page)
        page_patch.start()
        self.addCleanup(page_patch.stop)
        bai_patch = patch.object(sync, "resolve_bai", return_value="Test.Author.1")
        bai_patch.start()
        self.addCleanup(bai_patch.stop)
        self.next_url = "https://inspirehep.net/api/literature?page=2"

    def assert_sync_rejected(self, responses, message):
        with patch.object(sync, "get_json", side_effect=responses) as fetch:
            with self.assertRaisesRegex(RuntimeError, message):
                sync.main()
        self.assertEqual(self.page.read_text(encoding="utf-8"), self.original)
        return fetch

    def test_complete_pagination_updates_only_the_publication_block(self):
        first, second = publication(1), publication(2)
        responses = [
            literature_page([first], 2, self.next_url),
            literature_page([second], 2),
        ]
        with patch.object(sync, "get_json", side_effect=responses) as fetch, patch("builtins.print"):
            sync.main()
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(fetch.call_args_list[1].args, (self.next_url,))
        self.assertEqual(
            self.page.read_text(encoding="utf-8"),
            "Before\n" + sync.render_block([first, second]) + "\nAfter\n",
        )

    def test_missing_or_malformed_second_page_preserves_the_existing_page(self):
        malformed_pages = [
            [],
            {},
            {"hits": {}},
            {"hits": {"hits": {}, "total": 2}},
            {"hits": {"hits": [publication(2)]}},
            literature_page([publication(2)], "2"),
            literature_page([publication(2)], True),
            literature_page([publication(2)], -1),
            {"hits": {"hits": [publication(2)], "total": 2}, "links": []},
            literature_page([publication(2)], 2, {"page": 3}),
            literature_page([publication(2)], 2, ""),
            literature_page([None], 2),
            literature_page([{"id": "2"}], 2),
            literature_page([{"metadata": {"titles": [{"title": "Missing ID"}]}}], 2),
        ]
        for malformed in malformed_pages:
            with self.subTest(response=malformed):
                self.assert_sync_rejected(
                    [literature_page([publication(1)], 2, self.next_url), malformed],
                    "Unexpected INSPIRE|missing a control number",
                )

    def test_missing_next_link_cannot_silently_truncate_publications(self):
        self.assert_sync_rejected([literature_page([publication(1)], 2)], "returned 1 of 2")

    def test_changed_total_during_pagination_preserves_the_existing_page(self):
        self.assert_sync_rejected(
            [literature_page([publication(1)], 2, self.next_url), literature_page([publication(2)], 3)],
            "total changed",
        )

    def test_more_records_than_declared_total_are_rejected(self):
        self.assert_sync_rejected(
            [literature_page([publication(1), publication(2)], 1)], "does not match its total"
        )

    def test_duplicates_cannot_satisfy_the_declared_total(self):
        # The same record can appear with numeric or string control numbers.
        repeated = publication(1)
        repeated["metadata"]["control_number"] = "1"
        self.assert_sync_rejected(
            [literature_page([publication(1)], 2, self.next_url), literature_page([repeated], 2)],
            "duplicate publication 1",
        )

    def test_pagination_loop_stops_before_fetching_the_same_url_again(self):
        fetch = self.assert_sync_rejected(
            [
                literature_page([publication(1)], 3, self.next_url),
                literature_page([publication(2)], 3, self.next_url),
            ],
            "repeated URL",
        )
        self.assertEqual(fetch.call_count, 2)

    def test_empty_page_with_a_next_link_is_rejected(self):
        self.assert_sync_rejected(
            [literature_page([], 2, self.next_url)], "does not match its total"
        )

    def test_empty_result_does_not_erase_the_existing_page(self):
        self.assert_sync_rejected([literature_page([], 0)], "no publications")


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
