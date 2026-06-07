"""
模型扫描与切换 —— Live2D 模型目录自动发现 + 变体解析 + 切换
"""
import os
import json
import sys as _sys


def _model_dir():
    if getattr(_sys, "frozen", False):
        return os.path.join(_sys._MEIPASS, "ui", "model")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "ui", "model",
    )


def scan_models():
    model_dir = _model_dir()
    models = []
    if not os.path.isdir(model_dir):
        return models
    try:
        for entry in sorted(os.scandir(model_dir), key=lambda e: e.name):
            if not entry.is_dir():
                continue
            variants_path = os.path.join(entry.path, "variants.json")
            if os.path.exists(variants_path):
                try:
                    with open(variants_path, "r", encoding="utf-8") as f:
                        vdata = json.load(f)
                except Exception:
                    vdata = {}
                var_list = vdata.get("variants", [])
                if not var_list:
                    continue
                shared = _load_interactions(entry.path)
                for var in var_list:
                    var_sub = var.get("id", "")
                    var_label = var.get("label", var_sub)
                    var_model = var.get("model_file", "")
                    if not var_model:
                        continue
                    var_name = entry.name + "/" + var_sub
                    var_inter = _load_interactions(os.path.join(entry.path, var_sub)) or shared
                    models.append({
                        "name": var_name, "display": entry.name,
                        "variant_label": var_label, "model_file": var_model,
                        "base_name": entry.name, "interactions": var_inter,
                    })
            else:
                for f in os.listdir(entry.path):
                    if f.endswith(".model.json") or f.endswith(".model3.json"):
                        info = {
                            "name": entry.name, "display": entry.name,
                            "model_file": f, "base_name": entry.name,
                        }
                        info["interactions"] = _load_interactions(entry.path)
                        models.append(info)
                        break
    except Exception:
        pass
    return models


def _load_interactions(dir_path):
    path = os.path.join(dir_path, "interactions.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}
