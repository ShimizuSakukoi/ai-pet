"""pytest fixtures"""
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


@pytest.fixture
def sample_dafeng_path():
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "..", "ui", "model", "dafeng")
