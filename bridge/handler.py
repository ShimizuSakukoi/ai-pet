"""
Bridge Handler —— 前端 JS 可调用的 Python 方法
==============================================
通过 pywebview 的 js_api 暴露给前端，前端在 JS 里调用
pywebview.api.xxx() 即可触发这些方法。

规则：
  - 每个 public 方法的返回值会序列化为 JSON 传回前端
  - 命名下划线前缀的方法（如 _get_storage_dir）对前端不可见
  - 所有异常都必须捕获，返回 { ok: false, error: ... }

调用链示例：
  前端 sendMessage()
    → bridge.js sendChat()
      → pywebview.api.chat()
        → handler.py chat()
          → agent/brain.py PetBrain.chat()
            → LangGraph 图执行
              → LLM 调用
"""

import os
import json
import threading
import requests
import logging

from agent.brain import PetBrain, build_llm_from_settings
from config import (
    LLM_PROVIDERS,
    PROVIDER_MODELS,
    STORAGE_DIR_NAME,
    FRIENDSHIP_PET_GAIN,
)

logger = logging.getLogger(__name__)


class BridgeHandler:
    """
    pywebview JS Bridge 处理器
    所有不带下划线前缀的方法自动暴露给前端 JS
    """

    def __init__(self):
        self.brain = None          # PetBrain 实例（Agent 初始化后创建）
        self._pet_window = None    # 宠物窗口引用（Live2D 显示）
        self._chat_window = None   # 聊天窗口引用（对话 & 设置）
        self._storage = _get_storage_dir()  # 存储目录（%APPDATA%/AI-Pet/）
        self._on_top = False       # 窗口置顶状态
        self._last_review_date = None  # 上次每日回顾日期（防重复）
        self._settings = {}        # 当前设置缓存
        self._models = self._scan_models()  # 自动发现模型列表
        self._current_model = self._models[0]["name"] if self._models else "haru"
        self._model_index = 0
        os.makedirs(self._storage, exist_ok=True)

    def _scan_models(self):
        """扫描 ui/model/ 目录，自动发现所有 Live2D 模型"""
        import sys
        models = []
        if getattr(sys, "frozen", False):
            model_dir = os.path.join(sys._MEIPASS, "ui", "model")
        else:
            model_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ui", "model")
        if not os.path.isdir(model_dir):
            return [{"name": "haru", "model_file": "haru01.model.json"}]
        try:
            for entry in sorted(os.scandir(model_dir), key=lambda e: e.name):
                if entry.is_dir():
                    for f in os.listdir(entry.path):
                        if f.endswith(".model.json"):
                            models.append({"name": entry.name, "model_file": f})
                            break
        except Exception:
            pass
        return models or [{"name": "haru", "model_file": "haru01.model.json"}]

    def get_models(self):
        """返回自动发现的模型列表，供 JS 端初始化"""
        return {"models": self._models}

    # ==================== 设置管理 ====================

    def load_settings(self):
        """
        读取已保存的设置 & 自动初始化 Agent
        """
        path = os.path.join(self._storage, "settings.json")
        if not os.path.exists(path):
            return {"ok": False, "settings": None, "ready": False}

        try:
            with open(path, "r", encoding="utf-8") as f:
                settings = json.load(f)
        except Exception as e:
            return {"ok": False, "settings": None, "ready": False}

        self._settings = settings
        try:
            self.brain = PetBrain(
                pet_type=settings.get("pet_type", "cat"),
                pet_name=self._current_model,
                settings=settings,
                model_name=self._current_model,
            )
            self._on_top = settings.get("on_top", False)
            if self._chat_window:
                try:
                    self._chat_window.on_top = self._on_top
                except Exception:
                    pass
            print(f"[load_settings] 自动加载成功, model={self._current_model}", flush=True)
            return {"ok": True, "settings": settings, "ready": True}
        except Exception as e:
            import traceback
            print(f"[load_settings] 失败: {e}", flush=True)
            traceback.print_exc()
            return {"ok": True, "settings": settings, "ready": False,
                    "error": _safe_err(e)}

    def save_settings(self, settings):
        """
        保存设置到磁盘，并重新初始化 Agent
        前端点「保存并开始」时调用
        """
        # 1. 保存到磁盘
        try:
            self._settings = settings
            path = os.path.join(self._storage, "settings.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
        except Exception as e:
            return {"ok": False, "error": _safe_err(e)}

        # 2. 重新初始化 Agent
        try:
            self.brain = PetBrain(
                pet_type=settings.get("pet_type", "cat"),
                pet_name=self._current_model,
                settings=settings,
                model_name=self._current_model,
            )
            # 应用窗口置顶
            self._on_top = settings.get("on_top", False)
            if self._chat_window:
                try:
                    self._chat_window.on_top = self._on_top
                except Exception:
                    pass
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": _safe_err(e)}

    def test_connection(self, settings):
        """
        测试 LLM 连接：发一条简单消息验证 API Key 是否有效
        前端点「🔌 测试连接」时调用
        """
        try:
            llm = build_llm_from_settings(settings)
            resp = llm.invoke("请回复一个字：喵")
            return {"ok": True, "test_reply": resp.content.strip()}
        except Exception as e:
            return {"ok": False, "error": _safe_err(e)}

    def get_providers(self):
        """
        返回提供商列表 & 模型选项（给前端下拉框用）
        前端加载时调用，与 ui.js 中的 FALLBACK_MODELS 配合使用
        """
        return {"providers": {
            k: {
                "base_url": v["base_url"],
                "default_model": v["default_model"],
                "models": PROVIDER_MODELS.get(k, [v["default_model"]]),
            }
            for k, v in LLM_PROVIDERS.items()
        }}

    # ==================== 窗口控制 ====================

    def toggle_on_top(self):
        """切换窗口置顶状态（托盘菜单）"""
        self._on_top = not self._on_top
        for w in (self._pet_window, self._chat_window):
            if w:
                try:
                    w.on_top = self._on_top
                except Exception:
                    pass
        return {"on_top": self._on_top}

    def window_minimize(self):
        """最小化聊天窗口到系统托盘"""
        if self._chat_window:
            try:
                self._chat_window.hide()
            except Exception:
                pass

    def window_show(self):
        """从托盘恢复两个窗口"""
        for w in (self._pet_window, self._chat_window):
            if w:
                try:
                    w.show()
                except Exception:
                    pass

    def window_move(self, x, y):
        """移动聊天窗口到指定位置（JS 拖拽标题栏用）"""
        if self._chat_window:
            try:
                self._chat_window.move(int(x), int(y))
            except Exception:
                pass
        return {"ok": True}

    def switch_model(self, direction):
        """
        切换宠物窗口的 Live2D 模型 + 更新 Brain 性格
        由聊天窗口 ◀▶ 按钮触发
        """
        if not self._models:
            return {"ok": True}
        self._model_index = (self._model_index + int(direction)) % len(self._models)
        self._current_model = self._models[self._model_index]["name"]

        # 1. 宠物窗口：切换渲染的模型
        if self._pet_window:
            try:
                self._pet_window.evaluate_js(f"switchModel({int(direction)})")
            except Exception:
                pass

        # 2. 切换 Brain 的 System Prompt（persona.txt）
        if self.brain:
            try:
                self.brain.set_model(self._current_model)
            except Exception:
                pass

        return {"ok": True}

    def quit_app(self):
        """退出应用：销毁两个窗口 + 退出进程"""
        try:
            if self._chat_window:
                self._chat_window.destroy()
            if self._pet_window:
                self._pet_window.destroy()
        except Exception:
            os._exit(0)
        os._exit(0)

    # ==================== 聊天 / 互动 ====================

    def chat(self, text, thread_id="default"):
        """
        发送聊天消息 → 获取 AI 回复
        每次前端 sendMessage() 都会调用此方法
        """
        if not self.brain:
            return {
                "text": "我还没准备好…请先设置 API Key",
                "mood": "neutral",
                "friendship": 0,
            }
        try:
            return self.brain.chat(text, thread_id)
        except Exception as e:
            return {
                "text": f"(出错: {_safe_err(e)})",
                "mood": "neutral",
                "friendship": 0,
            }

    def reset(self, thread_id="default"):
        """
        清除所有记忆：清空长期记忆 + 删除 SQLite 对话数据库
        前端点「🗑 清除」时调用
        """
        if not self.brain:
            return {"text": "没有可清除的记忆", "mood": "neutral", "friendship": 0}
        return self.brain.reset(thread_id)

    def get_status(self, thread_id="default"):
        """
        获取当前宠物状态（情绪、好感度、记忆条数）
        前端每 30 秒轮询一次以更新状态栏
        """
        if not self.brain:
            return {
                "ready": False,
                "mood": "neutral",
                "friendship": 0,
                "memories_count": 0,
            }
        try:
            s = self.brain.get_status(thread_id)
            s["ready"] = True
            return s
        except Exception:
            return {
                "ready": True,
                "mood": "neutral",
                "friendship": 0,
                "memories_count": 0,
            }

    # ==================== 互动动作 ====================

    def pet_action(self, action_type, thread_id="default"):
        """
        发送特殊互动动作
        action_type 可选值：
          - "pet"     : 抚摸（双击模型）
          - "drag"    : 拖拽
          - "welcome" : 主人回来
          - "idle"    : 主动搭话
        """
        if not self.brain:
            return {
                "text": "",
                "mood": "neutral",
                "friendship": 0,
                "action": action_type,
            }
        try:
            result = self.brain.action(action_type, FRIENDSHIP_PET_GAIN, thread_id)

            # 如果有回复文本，推送到聊天窗口（跨窗口通信）
            text = result.get("text", "")
            mood = result.get("mood", "neutral")
            friendship = result.get("friendship", 0)
            if text and self._chat_window:
                try:
                    import json as _json
                    safe_text = _json.dumps(text)
                    self._chat_window.evaluate_js(
                        f"addMessage('pet', {safe_text}, true);"
                        f"updateFriendship({friendship});"
                    )
                except Exception:
                    pass

            return {**result, "action": action_type}
        except Exception as e:
            return {
                "text": "",
                "mood": "neutral",
                "friendship": 0,
                "action": action_type,
                "error": _safe_err(e),
            }

    def daily_review(self, thread_id="default"):
        """
        每日回顾：用 LLM 总结昨天的对话
        前端每天首次加载时自动调用一次
        使用 review_state.json 防止同一天重复生成
        """
        if not self.brain:
            return {"text": "", "ok": False}
        try:
            review_state_path = os.path.join(self._storage, "review_state.json")
            today = _today_str()

            # 今天已经做过回顾 → 跳过
            if os.path.exists(review_state_path):
                with open(review_state_path, "r") as f:
                    state = json.load(f)
                if state.get("last_review_date") == today:
                    return {"text": "", "ok": False, "skipped": True}

            # 生成回顾
            result = self.brain.daily_review(thread_id)

            # 标记今日已回顾
            with open(review_state_path, "w") as f:
                json.dump({"last_review_date": today}, f)

            return {"text": result.get("text", ""), "ok": True}
        except Exception as e:
            return {"text": "", "ok": False, "error": _safe_err(e)}

    # ==================== 记忆管理 ====================

    def get_memories(self):
        """获取所有长期记忆（按时间倒序）"""
        if not self.brain:
            return {"memories": []}
        try:
            mems = self.brain.ltm.get_all()
            return {"memories": list(reversed(mems))}
        except Exception:
            return {"memories": []}

    def delete_memory(self, mid):
        """删除单条记忆（前端记忆面板 × 按钮）"""
        if not self.brain:
            return {"ok": False}
        try:
            ok = self.brain.ltm.delete(mid)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

    def update_memory(self, mid, content):
        """修改单条记忆内容（前端记忆面板 ✎ 按钮）"""
        if not self.brain:
            return {"ok": False}
        try:
            ok = self.brain.ltm.update(mid, content)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

    # ==================== TTS 框架（占位，等训练模型接入） ====================

    def speak(self, text):
        """
        TTS 语音合成接口
        当前返回空占位数据（返回 None 表示未接入）
        接入训练好的本地 TTS 模型时，修改此方法对接本地服务
        """
        return {"audio": None, "format": ""}

    # ==================== 开机自启 ====================

    def get_autostart(self):
        """检查开机自启是否已启用"""
        import sys
        startup_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"),
            "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
        )
        bat_path = os.path.join(startup_dir, "AI-Pet.bat")
        return {"enabled": os.path.exists(bat_path)}

    def set_autostart(self, enable):
        """
        设置开机自启
        在 Startup 文件夹创建/删除 .bat 文件
        """
        import sys
        startup_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"),
            "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
        )
        os.makedirs(startup_dir, exist_ok=True)
        bat_path = os.path.join(startup_dir, "AI-Pet.bat")

        if enable:
            exe_path = sys.executable
            if getattr(sys, "frozen", False):
                target = exe_path
            else:
                target = os.path.join(os.path.dirname(exe_path), "python.exe")
                cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                script = os.path.join(cwd, "main.py")
                with open(bat_path, "w") as f:
                    f.write(f'@echo off\ncd /d "{cwd}"\nstart "" "{target}" "{script}"\n')
                return {"ok": True}

            with open(bat_path, "w") as f:
                f.write(f'@echo off\nstart "" "{target}"\n')
        else:
            if os.path.exists(bat_path):
                try:
                    os.remove(bat_path)
                except Exception:
                    pass

        return {"ok": True}


# ==================== 辅助函数 ====================

def _get_storage_dir():
    """
    获取 AppData 下的存储目录
    Windows: C:/Users/xxx/AppData/Roaming/AI-Pet/
    Other:   ~/AI-Pet/
    """
    return os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
    )


def _today_str():
    """返回当前日期字符串，格式 YYYY-MM-DD"""
    from datetime import date
    return str(date.today())


def _safe_err(e):
    """安全截断异常消息（防止过长消息导致前端渲染异常）"""
    return str(e)[:200]
