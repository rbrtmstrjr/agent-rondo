import os, sys, tempfile, unittest, inspect
os.environ["RENDER_ROOT"] = tempfile.mkdtemp(prefix="render-ad-test-")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render  # noqa: E402

def payload(**over):
    p = {"audio_b64": "UklGRg==", "script": "Gabi na, nawala ang signal.", "language": "tl",
         "scenes": [{"type": "video", "b64": "AAAA", "seconds": 3},
                    {"type": "screen", "url": "https://www.fishpin.app/images/onboarding/onboarding4.png", "seconds": 4}],
         "end_card": {"cta": "I-download sa Play Store", "url": "www.fishpin.app"}}
    p.update(over)
    return p

class RenderAdHelpers(unittest.TestCase):
    def test_root_honours_env(self):
        self.assertTrue(render.OUTPUT_DIR.startswith(os.environ["RENDER_ROOT"]))
        self.assertTrue(render.ASSETS_DIR.startswith(os.environ["RENDER_ROOT"]))

    def test_token_unconfigured_is_503(self):
        with self.assertRaises(render.AdRequestError) as cm:
            render.check_ad_token("anything", "")
        self.assertEqual(cm.exception.status, 503)

    def test_token_wrong_is_401(self):
        with self.assertRaises(render.AdRequestError) as cm:
            render.check_ad_token("nope", "secret")
        self.assertEqual(cm.exception.status, 401)

    def test_token_right_passes(self):
        self.assertIsNone(render.check_ad_token("secret", "secret"))

    def test_missing_audio_400(self):
        with self.assertRaises(render.AdRequestError) as cm:
            render.validate_ad_payload(payload(audio_b64=""))
        self.assertEqual(cm.exception.status, 400)

    def test_empty_scenes_400(self):
        with self.assertRaises(render.AdRequestError):
            render.validate_ad_payload(payload(scenes=[]))

    def test_off_domain_screen_400(self):
        with self.assertRaises(render.AdRequestError) as cm:
            render.validate_ad_payload(payload(scenes=[{"type": "screen", "url": "https://evil.example/x.png", "seconds": 4}]))
        self.assertIn("fishpin.app", cm.exception.message)

    def test_unknown_type_400(self):
        with self.assertRaises(render.AdRequestError):
            render.validate_ad_payload(payload(scenes=[{"type": "gif", "b64": "AA", "seconds": 2}]))

    def test_zero_seconds_400(self):
        with self.assertRaises(render.AdRequestError):
            render.validate_ad_payload(payload(scenes=[{"type": "image", "b64": "AA", "seconds": 0}]))

    def test_valid_payload_defaults_end_card(self):
        p = render.validate_ad_payload(payload())
        self.assertEqual(p["end_card"]["seconds"], 3.5)
        self.assertEqual((p["width"], p["height"], p["fps"]), (1080, 1920, 30))

    def test_tokenize_keeps_punctuation(self):
        self.assertEqual(render.tokenize_script("Gabi na,  nawala?"), ["Gabi", "na,", "nawala?"])

    def test_align_exact(self):
        rec = [("gabi", 0.0, 0.3), ("na", 0.3, 0.5)]
        self.assertEqual(render.align_script_words(["Gabi", "na,"], rec), [("Gabi", 0.0, 0.3), ("na,", 0.3, 0.5)])

    def test_align_misheard_word(self):
        words = ["Gabi", "na,", "nawala", "ang", "signal."]
        rec = [("gabi", 0.0, 0.3), ("na", 0.3, 0.5), ("NAWALAH", 0.5, 0.9), ("ang", 0.9, 1.1), ("signal", 1.1, 1.6)]
        out = render.align_script_words(words, rec)
        self.assertEqual(out[2][0], "nawala")
        self.assertAlmostEqual(out[2][1], 0.5)
        self.assertAlmostEqual(out[2][2], 0.9)

    def test_align_nothing_matches(self):
        self.assertIsNone(render.align_script_words(["Gabi"], [("xyz", 0.0, 0.5)]))

    def test_proportional_bounds(self):
        out = render.proportional_word_times(["a", "bb", "ccc"], 6.0)
        self.assertAlmostEqual(out[0][1], 0.0)
        self.assertAlmostEqual(out[-1][2], 6.0)
        self.assertTrue(all(out[i][2] <= out[i + 1][1] + 1e-9 for i in range(len(out) - 1)))

    def test_scale_preserves_ratio_and_total(self):
        d = render.scale_scene_durations([3, 2.5, 2.5, 4, 4, 5], 24.0, 3.5)
        self.assertAlmostEqual(sum(d), 20.9, places=2)
        self.assertAlmostEqual(d[5] / d[0], 5 / 3, places=2)

    def test_scale_enforces_minimum_exact_total(self):
        d = render.scale_scene_durations([0.2, 10, 10], 12.0, 3.5)
        self.assertGreaterEqual(d[0], 1.0)
        self.assertAlmostEqual(sum(d), 8.9, places=2)

    def test_ass_ad_style_and_colour(self):
        ass = render.build_ass_ad([("Gabi", 0.0, 0.3)], 1080, 1920)
        self.assertIn("Poppins", ass)
        self.assertIn(render.AMBER_ASS, ass)
        self.assertIn(",5,", ass.split("Style: Ad,")[1].split("\n")[0])

    def test_ass_ad_one_dialogue_per_word_keeps_case(self):
        ass = render.build_ass_ad([("Gabi", 0.0, 0.3), ("na,", 0.3, 0.5), ("FishPin", 0.5, 0.9)], 1080, 1920)
        self.assertEqual(ass.count("Dialogue:"), 3)
        self.assertIn("FishPin", ass)
        self.assertNotIn("FISHPIN", ass)

    def test_encode_args_meet_facebook_spec(self):
        a = render.ad_encode_args()
        joined = " ".join(a)
        for piece in ["-c:v libx264", "-pix_fmt yuv420p", "-r 30", "-g 60", "-keyint_min 60", "-sc_threshold 0",
                      "-c:a aac", "-ar 48000", "-ac 2", "-b:a 160k", "-movflags +faststart", "-maxrate 8M", "-bufsize 16M"]:
            self.assertIn(piece, joined)

    def test_existing_render_path_untouched(self):
        self.assertTrue(callable(render.render))
        self.assertIn('"base.en"', inspect.getsource(render.transcribe_words))

if __name__ == "__main__":
    unittest.main()
