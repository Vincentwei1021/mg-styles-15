"""Sample availability regression tests; fixtures never touch bundled samples."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

from mgaudio import samples
from mgaudio.core import SR


class SampleAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root_patch = patch.object(samples, 'ROOT', str(self.root))
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.clear_caches()
        self.addCleanup(self.clear_caches)
        self.index = {}

    @staticmethod
    def clear_caches():
        samples._index.cache_clear()
        samples.inst.cache_clear()
        samples.load.cache_clear()
        # Also run against the pre-fix implementation to prove the regression.
        if hasattr(samples._on_disk, 'cache_clear'):
            samples._on_disk.cache_clear()
        samples._hit_rr.clear()

    def item(self, name, note=60, peak=0.25, detected=60):
        return {'name': name, 'file': name + '.flac', 'midi': note,
                'detected_midi': detected, 'peak': peak}

    def set_index(self, **instruments):
        self.index = instruments
        (self.root / 'index.json').write_text(json.dumps(instruments))
        samples._index.cache_clear()

    def add_sample(self, item):
        x = 0.25 * np.sin(2 * np.pi * 440 * np.arange(960) / SR)
        sf.write(self.root / item['file'], x, SR, subtype='PCM_16')

    def remove_sample(self, item):
        (self.root / item['file']).unlink()

    def test_available_recognizes_additions_and_removals(self):
        item = self.item('piano_mf')
        self.set_index(piano=[item], empty=[])
        self.assertFalse(samples.available('piano'))
        self.assertEqual(samples.available(), [])
        self.add_sample(item)
        self.assertTrue(samples.available('piano'))
        self.assertEqual(samples.available(), ['piano'])
        self.remove_sample(item)
        self.assertFalse(samples.available('piano'))
        self.assertEqual(samples.available(), [])
        self.assertFalse(samples.available('unknown'))

    def test_available_returns_sorted_keys(self):
        z = self.item('z_mf')
        a = self.item('a_mf')
        self.set_index(z=[z], a=[a], empty=[])
        self.add_sample(z)
        self.add_sample(a)
        self.assertEqual(samples.available(), ['a', 'z'])

    def test_directories_are_not_samples(self):
        item = self.item('piano_mf')
        self.set_index(piano=[item])
        (self.root / item['file']).mkdir()
        self.assertFalse(samples.available('piano'))
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            samples.inst('piano')
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            samples.hit('piano')

    def test_all_missing_can_become_available_after_failed_construction(self):
        item = self.item('piano_mf')
        self.set_index(piano=[item])
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            samples.inst('piano')
        self.add_sample(item)
        self.assertEqual(samples.inst('piano').pick(60)['file'], item['file'])

    def setup_piano(self):
        far = self.item('far_mf', note=48)
        near = self.item('near_mf', note=59)
        target = self.item('target_mf', note=60)
        self.set_index(piano=[far, near, target])
        self.add_sample(far)
        return far, near, target, samples.inst('piano')

    def test_cached_instrument_recognizes_added_primary_sample(self):
        far, _, target, instrument = self.setup_piano()
        self.assertEqual(instrument.pick(60)['file'], far['file'])
        self.add_sample(target)
        self.assertIs(samples.inst('piano'), instrument)
        self.assertEqual(instrument.pick(60)['file'], target['file'])

    def test_cached_instrument_recognizes_added_fallback_sample(self):
        far, near, _, instrument = self.setup_piano()
        self.assertEqual(instrument.pick(60)['file'], far['file'])
        self.add_sample(near)
        # The primary choice is still absent; the fallback set must refresh too.
        self.assertEqual(instrument.pick(60)['file'], near['file'])

    def test_cached_instrument_falls_back_after_removal(self):
        far, _, target, instrument = self.setup_piano()
        self.add_sample(target)
        self.assertEqual(instrument.pick(60)['file'], target['file'])
        self.remove_sample(target)
        self.assertEqual(instrument.pick(60)['file'], far['file'])
        self.remove_sample(far)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            instrument.pick(60)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            instrument.play(60)

    def test_cached_instrument_rejects_removed_fallback(self):
        far, near, _, instrument = self.setup_piano()
        self.assertEqual(instrument.pick(60)['file'], far['file'])
        self.remove_sample(far)
        self.add_sample(near)
        self.assertEqual(instrument.pick(60)['file'], near['file'])

    def test_removal_of_initially_present_primary_is_detected(self):
        far = self.item('far_mf', note=48)
        target = self.item('target_mf')
        self.set_index(piano=[far, target])
        self.add_sample(far)
        self.add_sample(target)
        instrument = samples.inst('piano')
        self.assertEqual(instrument.pick(60)['file'], target['file'])
        self.remove_sample(target)
        self.assertEqual(instrument.pick(60)['file'], far['file'])
        self.remove_sample(far)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            instrument.pick(60)

    def test_play_recovers_after_all_samples_are_removed_and_restored(self):
        item = self.item('piano_mf')
        self.set_index(piano=[item])
        self.add_sample(item)
        instrument = samples.inst('piano')
        before = instrument.play(60).data
        self.remove_sample(item)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            instrument.play(60)
        self.add_sample(item)
        np.testing.assert_array_equal(instrument.play(60).data, before)

    def test_instrument_filters_are_preserved_during_refresh(self):
        far = self.item('keep_far_mf', note=48, detected=48)
        near = self.item('keep_near_mf', note=59, detected=59)
        excluded = self.item('keep_FX_mf')
        unmatched = self.item('other_mf')
        unreliable = self.item('keep_bad_mf', detected=72)
        unpitched = self.item('keep_hit_mf', note=None, detected=None)
        self.set_index(piano=[far, near, excluded, unmatched, unreliable, unpitched])
        for item in (far, excluded, unmatched, unreliable, unpitched):
            self.add_sample(item)
        instrument = samples.inst('piano', match='keep', exclude='FX', reliable_only=True)
        self.assertEqual(instrument.pick(60)['file'], far['file'])
        self.add_sample(near)
        self.assertEqual(instrument.pick(60)['file'], near['file'])
        self.remove_sample(far)
        self.remove_sample(near)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            instrument.pick(60)

    def test_full_index_round_robin_and_gain_are_unchanged(self):
        a = self.item('a_mf', peak=0.2)
        b = self.item('b_mf', peak=0.4)
        soft = self.item('soft_p', peak=0.1)
        self.set_index(piano=[a, b, soft])
        for item in (a, b, soft):
            self.add_sample(item)
        instrument = samples.inst('piano')
        self.assertEqual([instrument.pick(60, 0.65)['file'] for _ in range(4)],
                         [b['file'], a['file'], b['file'], a['file']])
        self.assertEqual(instrument.pick(60, 0.35)['file'], soft['file'])
        self.assertAlmostEqual(instrument.gain, 0.5 / (0.3 + 1e-9))

    def test_hit_recognizes_additions_removals_even_with_cached_audio(self):
        soft = self.item('gong_p', note=None)
        loud = self.item('gong_f', note=None)
        self.set_index(gong=[soft, loud])
        self.add_sample(soft)
        with patch.object(samples, 'load', wraps=samples.load) as load:
            samples.hit('gong', vel=0.8)
            self.assertEqual(load.call_args.args[0], soft['file'])
            self.add_sample(loud)
            samples.hit('gong', vel=0.8)
            self.assertEqual(load.call_args.args[0], loud['file'])
            self.remove_sample(loud)
            samples.hit('gong', vel=0.8)
            self.assertEqual(load.call_args.args[0], soft['file'])
            self.remove_sample(soft)
            with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
                samples.hit('gong', vel=0.8)

    def test_hit_all_missing_recovers_and_match_is_respected(self):
        item = self.item('gong_f', note=None)
        other = self.item('bell_f', note=None)
        self.set_index(gong=[item, other])
        self.add_sample(other)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            samples.hit('gong', match='GONG')
        self.add_sample(item)
        with patch.object(samples, 'load', wraps=samples.load) as load:
            samples.hit('gong', match='GONG')
            self.assertEqual(load.call_args.args[0], item['file'])
        self.remove_sample(item)
        with self.assertRaisesRegex(RuntimeError, 'no samples on disk'):
            samples.hit('gong', match='GONG')

    def test_hit_round_robin_is_unchanged(self):
        a = self.item('gong_a_f', note=None)
        b = self.item('gong_b_f', note=None)
        self.set_index(gong=[a, b])
        self.add_sample(a)
        self.add_sample(b)
        with patch.object(samples, 'load', wraps=samples.load) as load:
            for _ in range(4):
                samples.hit('gong', vel=0.8)
            self.assertEqual([c.args[0] for c in load.call_args_list],
                             [a['file'], b['file'], a['file'], b['file']])
            samples.hit('gong', rr=1)
            self.assertEqual(load.call_args.args[0], b['file'])


if __name__ == '__main__':
    unittest.main()
