"""Unit tests for output parsing: python3 -m unittest collector/test_collector.py"""
import json
import unittest

from collector import parse_compute_apps, parse_nvidia_extended, parse_nvidia_smi, parse_rocm_smi, to_float, to_int


class ParseTests(unittest.TestCase):
    def test_nvidia(self):
        out = (
            "0, NVIDIA H100 80GB HBM3, GPU-aaa, 97, 81559, 40000, 71, 612.40, [N/A], 550.54.15\n"
            "1, NVIDIA GeForce RTX 4090, GPU-bbb, 3, 24564, 512, 38, 21.5, 30, 550.54.15\n"
        )
        gpus = parse_nvidia_smi(out)
        self.assertEqual(len(gpus), 2)
        self.assertEqual(gpus[0]["name"], "NVIDIA H100 80GB HBM3")
        self.assertEqual(gpus[0]["uuid"], "GPU-aaa")
        self.assertEqual(gpus[0]["utilPercent"], 97)
        self.assertEqual(gpus[0]["vramUsedMB"], 40000)
        self.assertEqual(gpus[0]["fanPercent"], 0)  # [N/A] on datacenter GPUs
        self.assertEqual(gpus[1]["powerW"], 21.5)

    def test_nvidia_name_with_comma(self):
        gpus = parse_nvidia_smi("0, Tesla V100, SXM2, GPU-x, 10, 16000, 100, 40, 50, 0, 535\n")
        self.assertEqual(gpus[0]["name"], "Tesla V100, SXM2")
        self.assertEqual(gpus[0]["driverVersion"], "535")

    def test_rocm(self):
        out = json.dumps({
            "card0": {
                "Card series": "AMD Instinct MI250X",
                "GPU use (%)": "88",
                "Temperature (Sensor edge) (C)": "65.0",
                "Current Socket Graphics Package Power (W)": "402.0",
                "VRAM Total Memory (B)": str(64 * 1024 ** 3),
                "VRAM Total Used Memory (B)": str(16 * 1024 ** 3),
                "Fan speed (%)": "0",
                "Unique ID": "0x1234",
            },
            "system": {"Driver version": "6.7.0"},
        })
        gpus = parse_rocm_smi(out)
        self.assertEqual(len(gpus), 1)
        g = gpus[0]
        self.assertEqual(g["name"], "AMD Instinct MI250X")
        self.assertEqual(g["utilPercent"], 88)
        self.assertEqual(g["tempC"], 65)
        self.assertEqual(g["powerW"], 402)
        self.assertEqual(g["vramTotalMB"], 65536)
        self.assertEqual(g["vramUsedMB"], 16384)
        self.assertEqual(g["driverVersion"], "6.7.0")

    def test_nvidia_extended(self):
        out = (
            "0, 45, 1980, 2619, P0, 0x0000000000000004, 0, 5, 16\n"
            "1, [N/A], 210, 405, P8, 0x0000000000000041, [N/A], 4, 16\n"
        )
        ext = parse_nvidia_extended(out)
        self.assertEqual(ext[0]["smClockMHz"], 1980)
        self.assertEqual(ext[0]["throttleMask"], 4)
        self.assertEqual(ext[0]["eccUncorrected"], 0)
        self.assertEqual(ext[0]["pcieGen"], 5)
        self.assertEqual(ext[1]["throttleMask"], 0x41)
        self.assertNotIn("eccUncorrected", ext[1])
        self.assertNotIn("memUtilPercent", ext[1])
        self.assertEqual(ext[1]["pstate"], "P8")

    def test_compute_apps(self):
        out = (
            "GPU-aaa, 4242, /usr/bin/python3, 30210\n"
            "GPU-zzz, 1, unknown-gpu, 10\n"
            "GPU-bbb, 77, [N/A], 512\n"
        )
        procs = parse_compute_apps(out, {"GPU-aaa": 0, "GPU-bbb": 1})
        self.assertEqual(len(procs), 2)
        self.assertEqual(procs[0], {"gpuIndex": 0, "pid": 4242, "name": "python3", "user": None, "vramMB": 30210})
        self.assertEqual(procs[1]["gpuIndex"], 1)

    def test_to_int(self):
        self.assertEqual(to_int("0x10"), 16)
        self.assertEqual(to_int("[N/A]"), None)
        self.assertEqual(to_int("3.0"), 3)

    def test_to_float(self):
        self.assertEqual(to_float("[Not Supported]"), 0)
        self.assertEqual(to_float("42 %"), 42)
        self.assertEqual(to_float(None, -1), -1)


if __name__ == "__main__":
    unittest.main()
