"""Validate supplied original synthesized media without audio-device access."""
from pathlib import Path
from array import array
import hashlib,json,math,sys,unittest,wave
ROOT=Path(__file__).resolve().parent.parent
class MusicAssets(unittest.TestCase):
    def test_audio_pcm_and_arrangement_metadata_are_complete_and_not_clipped(self):
        manifest=json.loads((ROOT/'music/manifest.json').read_text(encoding='utf8'))
        for kind in ['gentle','travel']:
            with self.subTest(track=kind):
                path=ROOT/'home/assets/music'/f'{kind}.wav';score=json.loads((ROOT/'music/scores'/kind/'score.json').read_text(encoding='utf8'))
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),manifest[kind]['wav_sha256'])
                with wave.open(str(path),'rb') as wav:
                    self.assertEqual((wav.getnchannels(),wav.getsampwidth(),wav.getframerate()),(2,2,24000));frames=wav.getnframes();samples=array('h',wav.readframes(frames))
                if sys.byteorder!='little':samples.byteswap()
                rms=math.sqrt(sum(x*x for x in samples)/len(samples))/32768;peak=max(map(abs,samples))/32768
                self.assertAlmostEqual(frames/24000,32*60/score['tempo_bpm'],places=4);self.assertTrue(.11<rms<.15);self.assertLess(peak,.8)
                self.assertLess(max(abs(samples[0]-samples[-2]),abs(samples[1]-samples[-1]))/32768,.025)
                self.assertGreater(len(score['events']),60);self.assertGreater(len({x['midi'] for x in score['events']}),12);self.assertIn('not attributed',score['attribution'])
    def test_all_music_ui_keys_match_and_do_not_replace_brand_or_user_content(self):
        catalog=json.loads((ROOT/'home/locales/common.json').read_text(encoding='utf8'))
        self.assertEqual({k for k in catalog['en'] if k.startswith('music.')},{k for k in catalog['zh-CN'] if k.startswith('music.')})
        self.assertEqual(catalog['en']['common.brandName'],'谢雨卿')
        for language in catalog:self.assertNotIn('钢琴录音',catalog[language]['music.gentle'])
if __name__=='__main__':unittest.main()
