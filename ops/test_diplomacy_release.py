import datetime, importlib.util, json, pathlib, tempfile, unittest

spec=importlib.util.spec_from_file_location('release',pathlib.Path(__file__).with_name('diplomacy-release.py'))
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class QuotaMigration(unittest.TestCase):
    def test_legacy_to_new_and_back_never_resets_usage(self):
        with tempfile.TemporaryDirectory(prefix='diplomacy-release-test-') as temporary:
            root=pathlib.Path(temporary);old=root/'old.json';new=root/'new.json'
            today=datetime.datetime.now(datetime.timezone.utc).date();day=(today-datetime.date(1970,1,1)).days
            old.write_text(json.dumps({'day':day,'calls':12}))
            release.carry_quota(old,new);self.assertEqual(json.loads(new.read_text()),{'day':today.isoformat(),'calls':12})
            new.write_text(json.dumps({'day':today.isoformat(),'calls':17}));release.carry_quota(new,old,legacy=True)
            self.assertEqual(json.loads(old.read_text()),{'day':day,'calls':17})
            release.carry_quota(old,new);self.assertEqual(json.loads(new.read_text())['calls'],17)

    def test_corrupt_or_future_ledger_cannot_reset_limit(self):
        with tempfile.TemporaryDirectory(prefix='diplomacy-release-test-') as temporary:
            file=pathlib.Path(temporary)/'quota.json'
            for data in [{'calls':0},{'day':'9999-01-01','calls':0},{'day':'2026-01-01','calls':-1},{'day':'2026-02-31','calls':0}]:
                file.write_text(json.dumps(data))
                with self.assertRaises(RuntimeError):release.quota(file)

    def test_release_links_never_overwrite_regular_files(self):
        with tempfile.TemporaryDirectory(prefix='diplomacy-release-test-') as temporary:
            file=pathlib.Path(temporary)/'current';file.write_text('keep this')
            with self.assertRaises(RuntimeError):release.link(file,pathlib.Path(temporary)/'release')
            self.assertEqual(file.read_text(),'keep this')

if __name__=='__main__':unittest.main()
