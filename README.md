# n8n-nodes-cambai

This is an n8n community node for [Camb.ai](https://camb.ai) - an AI-powered audio platform providing text-to-speech, voice cloning, transcription, translation, and more.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

### Audio
- **Synthesize (TTS)** - Convert text to speech using MARS models (flash, pro, instruct)
- **Translated TTS** - Translate text and synthesize speech in one step
- **Generate Sound** - Generate sound effects or music from text prompts
- **Separate Audio** - Isolate foreground (vocals) from background audio

### Text
- **Transcribe** - Convert speech to text with timestamps and speaker identification
- **Translate** - Translate text between languages

### Voice
- **Clone Voice** - Create a custom voice from an audio sample
- **Create from Description** - Generate a voice from a text description
- **List Voices** - Get all available voices

## Credentials

You need a Camb.ai API key to use this node. Get your API key from [Camb.ai](https://studio.camb.ai).

## Compatibility

- Requires n8n version 1.0.0 or later
- Tested with n8n version 2.2.0

## Resources

- [Camb.ai Documentation](https://docs.camb.ai)
- [Camb.ai API Reference](https://docs.camb.ai/api-reference)
- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE)
