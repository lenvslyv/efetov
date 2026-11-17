"""Exercise the actual installer guards without connecting to a server."""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('install-server-update.sh').read_text(encoding='utf-8')


def block(command):
    return SOURCE.split(command + " <<'PY'\n", 1)[1].split('\nPY\n', 1)[0]


def run(code, *arguments):
    with patch.object(sys, 'argv', ['installer', *map(str, arguments)]):
        exec(compile(code, 'installer-check', 'exec'), {'__name__': '__main__'})


class DeploymentGuards(unittest.TestCase):
    def test_embedded_python_compiles_and_staging_metadata_is_not_copied(self):
        snippets = re.findall(r"<<'PY'(?: \|\| true)?\n(.*?)\nPY(?:\n|$)", SOURCE, re.S)
        self.assertEqual(len(snippets), 5)
        for code in snippets:
            compile(code, 'installer-check', 'exec')
        self.assertNotIn('cp -a "$stage/." "$app_dir/"', SOURCE)
        self.assertIn('tar -xzf "$archive" -C "$app_dir" --no-same-owner', SOURCE)
        self.assertIn('chmod "$app_mode" "$app_dir"', SOURCE)

    def test_archive_guard_rejects_root_traversal_links_and_data(self):
        code = block('python3 - "$archive"')
        with tempfile.TemporaryDirectory() as folder:
            archive_path = Path(folder) / 'payload.tar.gz'
            for name, symlink, accepted in [('src/app.ts', False, True), ('.', False, False),
                                             ('../escape', False, False), ('/absolute', False, False),
                                             ('backend/data/live.db', False, False), ('src/link', True, False)]:
                with tarfile.open(archive_path, 'w:gz') as archive:
                    entry = tarfile.TarInfo(name)
                    if symlink:
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = '/outside'
                    archive.addfile(entry)
                if accepted:
                    run(code, archive_path)
                else:
                    with self.assertRaises(SystemExit):
                        run(code, archive_path)

    def test_requirements_guard_accepts_line_endings_and_rejects_new_dependencies(self):
        code = block('python3 - "$app_dir/backend/requirements.txt" "$stage/backend/requirements.txt"')
        with tempfile.TemporaryDirectory() as folder:
            before, after = Path(folder) / 'before', Path(folder) / 'after'
            before.write_bytes(b'fastapi>=0.115.0\npydantic>=2.10.0\n')
            after.write_bytes(b'\xef\xbb\xbffastapi>=0.115.0\r\npydantic>=2.10.0\r\n')
            run(code, before, after)
            after.write_bytes(b'fastapi>=0.999.0\npydantic>=2.10.0\n')
            with patch('sys.stderr', io.StringIO()), self.assertRaises(SystemExit):
                run(code, before, after)

    def test_live_checks_reject_stale_release_or_wrong_index(self):
        code = block('python3 - "$stage/dist/deployment-manifest.json"')
        index = b'<title>Sechenov Scientific</title>'
        expected = {'releaseId': 'test-new-release', 'indexSha256': hashlib.sha256(index).hexdigest()}
        schema = {'paths': {'/api/ui-events/{action}': {}, '/api/patients/{patient_id}': {'get': {}}},
                  'components': {'schemas': {'CreateUserBody': {'properties': {'center': {}}}}}}
        with tempfile.TemporaryDirectory() as folder:
            manifest = Path(folder) / 'manifest.json'
            manifest.write_text(json.dumps(expected), encoding='utf-8')
            for wrong_version, wrong_index in [(False, False), (True, False), (False, True)]:
                def respond(url, timeout=2):
                    if url.endswith('/api/health'):
                        return io.BytesIO(b'{"ok":true}')
                    if url.endswith('/openapi.json'):
                        return io.BytesIO(json.dumps(schema).encode())
                    if url.endswith('/deployment-manifest.json'):
                        return io.BytesIO(json.dumps({'releaseId': 'old' if wrong_version else expected['releaseId']}).encode())
                    return io.BytesIO(b'old index' if wrong_index else index)
                with patch('urllib.request.urlopen', respond), patch('time.sleep'):
                    if wrong_version or wrong_index:
                        with self.assertRaises(SystemExit):
                            run(code, manifest)
                    else:
                        run(code, manifest)


if __name__ == '__main__':
    unittest.main(verbosity=2)
