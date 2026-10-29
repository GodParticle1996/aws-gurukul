"""Failure-path integration tests against disposable owned Moto servers; no Docker/real AWS."""
import contextlib
import io
import os
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

import boto3

LAB = Path(__file__).with_name('lab.py')


class CleanupTests(unittest.TestCase):
    def exercise(self, fail_after, cleanup_failure=False):
        namespace = {'__file__': str(LAB), '__name__': '__cleanup_replay__'}
        original = RuntimeError('injected original setup/experiment failure')
        secondary = RuntimeError('injected endpoint cleanup failure')
        injected = False
        cleanup_injected = False
        real_client = boto3.client

        def before_create(**kwargs):
            nonlocal injected
            if fail_after is not None and len(namespace['own']['eps']) == fail_after:
                injected = True
                raise original

        def before_delete(**kwargs):
            nonlocal injected, cleanup_injected
            if fail_after is None and not injected:
                injected = True
                raise original  # All endpoints exist; the experiment's ecr.dkr deletion fails.
            if cleanup_failure and not cleanup_injected:
                cleanup_injected = True
                raise secondary

        def client(service, **kwargs):
            result = real_client(service, **kwargs)
            if service == 'ec2':
                result.meta.events.register('before-call.ec2.CreateVpcEndpoint', before_create)
                result.meta.events.register('before-call.ec2.DeleteVpcEndpoints', before_delete)
            return result

        output = io.StringIO()
        with patch.dict(os.environ), patch('boto3.client', side_effect=client), contextlib.redirect_stdout(output):
            with self.assertRaises(RuntimeError) as caught:
                exec(compile(LAB.read_text(), str(LAB), 'exec'), namespace)
        self.assertIs(caught.exception, original, 'cleanup must preserve the original failure')
        self.assertIn('OWNED MOTO STOPPED / LISTENER CLOSED', output.getvalue())
        with self.assertRaises(OSError):
            socket.create_connection((namespace['host'], namespace['port']), timeout=.5)
        if cleanup_failure:
            self.assertTrue(cleanup_injected)
            self.assertTrue(namespace['left']['endpoints'], 'injected cleanup failure is observable')
            self.assertFalse(namespace['left']['roles'], 'cleanup continues to later IAM resources')
            self.assertIn(str(secondary), '\n'.join(original.__notes__))
        else:
            self.assertEqual(namespace['own']['eps'], [])
            self.assertFalse(any(namespace['left'].values()), 'all owned resources checked by the lab are gone')
            self.assertFalse(getattr(original, '__notes__', []), 'cleanup adds no secondary error')

    def test_failure_before_first_endpoint(self):
        self.exercise(0)

    def test_failure_after_first_endpoint(self):
        self.exercise(1)

    def test_failure_before_experiment_endpoint_deletion(self):
        self.exercise(None)

    def test_cleanup_failure_preserves_primary_and_continues(self):
        self.exercise(1, cleanup_failure=True)


if __name__ == '__main__':
    unittest.main()
