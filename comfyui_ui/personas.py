"""Named chat personas.

A persona bundles the Chat tab's settings — system prompt, voice engine and the
voice for that engine — under a name, so the same app can switch between roles
(for example "Code helper" and "Storyteller"). Personas live in the owner's
workspace file ``chat_personas.json`` (see :mod:`comfyui_ui.storage`)::

    {
      "personas": {
        "Storyteller": {
          "system_prompt": "You are a vivid storyteller.",
          "voice_engine": "pocket-tts",
          "voice": "af_heart"
        }
      }
    }

``voice_engine`` is ``off``, ``browser`` or an audio.cpp model id from
``configs/audio_models.json``; it tells the UI which control ``voice`` belongs
to. The file is optional: a missing or unreadable one is treated as empty, and
hand edits are supported.
"""

import json
import os

from . import storage

_SPECIAL_VOICE_ENGINES = ("off", "browser")
_MAX_NAME_LENGTH = 80


def _personas_path(owner_id: int) -> str:
    return storage.owner_file(owner_id, "chat_personas.json")


def _load_config(owner_id: int) -> dict:
    """Load the raw personas config, returning an empty one when unreadable."""
    path = _personas_path(owner_id)
    if not os.path.isfile(path):
        return {"personas": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"personas": {}}
    if not isinstance(config, dict):
        return {"personas": {}}
    return config


def _write_config(owner_id: int, config: dict) -> None:
    """Write the config atomically, creating the owner directory if needed."""
    storage.write_json_atomic(_personas_path(owner_id), config)


def _clean_voice_engine(value) -> str:
    """Normalize a voice engine: a special value or an audio.cpp model id."""
    engine = str(value or "off").strip()
    if engine.lower() in _SPECIAL_VOICE_ENGINES:
        return engine.lower()
    return engine or "off"


def _clean_persona(values: dict) -> dict:
    """Return a persona with only the supported, correctly typed fields."""
    values = values if isinstance(values, dict) else {}
    prompt = values.get("system_prompt")
    voice = values.get("voice")
    return {
        "system_prompt": prompt if isinstance(prompt, str) else "",
        "voice_engine": _clean_voice_engine(values.get("voice_engine")),
        "voice": voice if isinstance(voice, str) else "",
    }


def get_personas(owner_id: int) -> dict:
    """Return saved personas as a ``name -> settings`` mapping, in saved order."""
    personas = _load_config(owner_id).get("personas")
    if not isinstance(personas, dict):
        return {}
    return {
        name: _clean_persona(values)
        for name, values in personas.items()
        if isinstance(name, str) and name.strip()
    }


def get_persona(owner_id: int, persona_name: str) -> dict | None:
    """Return one persona's settings, or None when it does not exist."""
    name = (persona_name or "").strip()
    if not name:
        return None
    return get_personas(owner_id).get(name)


def save_persona(owner_id: int, persona_name: str, values: dict) -> dict:
    """Create or replace a persona and persist it.

    The config is re-read before writing so hand edits made while the app is
    running are preserved. An existing persona keeps its position; new ones are
    appended. Returns the stored settings.
    """
    name = (persona_name or "").strip()
    if not name:
        raise ValueError("A persona name is required.")
    if len(name) > _MAX_NAME_LENGTH:
        raise ValueError(
            f"A persona name must be {_MAX_NAME_LENGTH} characters or fewer."
        )

    config = _load_config(owner_id)
    personas = config.get("personas")
    if not isinstance(personas, dict):
        personas = {}
        config["personas"] = personas

    cleaned = _clean_persona(values)
    personas[name] = cleaned
    _write_config(owner_id, config)
    return cleaned


def delete_persona(owner_id: int, persona_name: str) -> bool:
    """Delete a persona. Returns True when one was removed."""
    name = (persona_name or "").strip()
    if not name:
        return False

    config = _load_config(owner_id)
    personas = config.get("personas")
    if not isinstance(personas, dict) or name not in personas:
        return False

    del personas[name]
    _write_config(owner_id, config)
    return True
