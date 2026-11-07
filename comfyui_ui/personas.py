"""Named chat personas.

A persona bundles the Chat tab's settings — system prompt, voice engine and the
voice for that engine — under a name, so the same app can switch between roles
(for example "Code helper" and "Storyteller"). Personas are stored in
``configs/chat_personas.json``::

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

from .config import CHAT_PERSONAS_PATH

_SPECIAL_VOICE_ENGINES = ("off", "browser")
_MAX_NAME_LENGTH = 80


def _load_config() -> dict:
    """Load the raw personas config, returning an empty one when unreadable."""
    if not os.path.isfile(CHAT_PERSONAS_PATH):
        return {"personas": {}}
    try:
        with open(CHAT_PERSONAS_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"personas": {}}
    if not isinstance(config, dict):
        return {"personas": {}}
    return config


def _write_config(config: dict) -> None:
    """Write the config atomically, creating the configs folder if needed."""
    os.makedirs(os.path.dirname(CHAT_PERSONAS_PATH), exist_ok=True)
    tmp_path = CHAT_PERSONAS_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, CHAT_PERSONAS_PATH)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


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


def get_personas() -> dict:
    """Return saved personas as a ``name -> settings`` mapping, in saved order."""
    personas = _load_config().get("personas")
    if not isinstance(personas, dict):
        return {}
    return {
        name: _clean_persona(values)
        for name, values in personas.items()
        if isinstance(name, str) and name.strip()
    }


def get_persona(persona_name: str) -> dict | None:
    """Return one persona's settings, or None when it does not exist."""
    name = (persona_name or "").strip()
    if not name:
        return None
    return get_personas().get(name)


def save_persona(persona_name: str, values: dict) -> dict:
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

    config = _load_config()
    personas = config.get("personas")
    if not isinstance(personas, dict):
        personas = {}
        config["personas"] = personas

    cleaned = _clean_persona(values)
    personas[name] = cleaned
    _write_config(config)
    return cleaned


def delete_persona(persona_name: str) -> bool:
    """Delete a persona. Returns True when one was removed."""
    name = (persona_name or "").strip()
    if not name:
        return False

    config = _load_config()
    personas = config.get("personas")
    if not isinstance(personas, dict) or name not in personas:
        return False

    del personas[name]
    _write_config(config)
    return True
