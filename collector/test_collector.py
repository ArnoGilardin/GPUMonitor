"""Unit tests for output parsing: python3 -m unittest collector/test_collector.py"""
import json
import unittest

from collector import parse_nvidia_smi, parse_rocm_smi, to_float


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

    def test_to_float(self):
        self.assertEqual(to_float("[Not Supported]"), 0)
        self.assertEqual(to_float("42 %"), 42)
        self.assertEqual(to_float(None, -1), -1)


if __name__ == "__main__":
    unittest.main()
