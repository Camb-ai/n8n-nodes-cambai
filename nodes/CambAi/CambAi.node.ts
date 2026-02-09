import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { cambAiApiRequest, pollForResult, generateWavHeader, FormData } from './GenericFunctions';

// Sample rates per model
const MODEL_SAMPLE_RATES: Record<string, number> = {
	'mars-flash': 22050,
	'mars-pro': 48000,
	'mars-instruct': 22050,
};

export class CambAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Camb.ai',
		name: 'cambAi',
		icon: 'file:cambai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Use Camb.ai for TTS, transcription, translation, voice cloning, and more',
		defaults: {
			name: 'Camb.ai',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'cambAiApi',
				required: true,
			},
		],
		properties: [
			// Resource selector
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Audio',
						value: 'audio',
						description: 'Generate or process audio',
					},
					{
						name: 'Text',
						value: 'text',
						description: 'Translate or transcribe text',
					},
					{
						name: 'Voice',
						value: 'voice',
						description: 'Create or clone voices',
					},
				],
				default: 'audio',
			},

			// ==================
			// AUDIO OPERATIONS
			// ==================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['audio'],
					},
				},
				options: [
					{
						name: 'Synthesize (TTS)',
						value: 'synthesize',
						description: 'Convert text to speech',
						action: 'Synthesize text to speech',
					},
					{
						name: 'Translated TTS',
						value: 'translatedTts',
						description: 'Translate text and convert to speech',
						action: 'Translate and synthesize',
					},
					{
						name: 'Generate Sound',
						value: 'generateSound',
						description: 'Generate sound or music from text prompt',
						action: 'Generate sound from prompt',
					},
					{
						name: 'Separate Audio',
						value: 'separateAudio',
						description: 'Isolate speech from background audio',
						action: 'Separate audio components',
					},
				],
				default: 'synthesize',
			},

			// ==================
			// TEXT OPERATIONS
			// ==================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['text'],
					},
				},
				options: [
					{
						name: 'Transcribe',
						value: 'transcribe',
						description: 'Convert speech to text',
						action: 'Transcribe audio to text',
					},
					{
						name: 'Translate',
						value: 'translate',
						description: 'Translate text between languages',
						action: 'Translate text',
					},
				],
				default: 'transcribe',
			},

			// ==================
			// VOICE OPERATIONS
			// ==================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['voice'],
					},
				},
				options: [
					{
						name: 'Clone Voice',
						value: 'cloneVoice',
						description: 'Clone a voice from an audio sample',
						action: 'Clone voice from audio',
					},
					{
						name: 'Create From Description',
						value: 'createVoice',
						description: 'Create a voice from text description',
						action: 'Create voice from description',
					},
					{
						name: 'List Voices',
						value: 'listVoices',
						description: 'Get all available voices',
						action: 'List available voices',
					},
				],
				default: 'listVoices',
			},

			// ============================
			// SYNTHESIZE (TTS) PARAMETERS
			// ============================
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize'],
					},
				},
				description: 'Text to convert to speech (3-3000 characters)',
			},
			{
				displayName: 'Voice ID',
				name: 'voiceId',
				type: 'number',
				default: 147320,
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize'],
					},
				},
				description: 'Voice ID to use for synthesis (integer)',
			},
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: 'en-us',
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize'],
					},
				},
				placeholder: 'e.g., en-us, fr-fr',
				description: 'BCP-47 language code for synthesis',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'mars-flash',
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize'],
					},
				},
				options: [
					{
						name: 'MARS Flash',
						value: 'mars-flash',
						description: 'Fast inference, 22.05kHz (recommended)',
					},
					{
						name: 'MARS Pro',
						value: 'mars-pro',
						description: 'Higher quality, 48kHz',
					},
					{
						name: 'MARS Instruct',
						value: 'mars-instruct',
						description: 'Supports user instructions, 22.05kHz',
					},
				],
				description: 'The MARS TTS model to use',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				default: 'wav',
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize', 'generateSound'],
					},
				},
				options: [
					{
						name: 'WAV',
						value: 'wav',
						description: 'WAV audio format',
					},
					{
						name: 'FLAC',
						value: 'flac',
						description: 'FLAC lossless compression',
					},
					{
						name: 'AAC (ADTS)',
						value: 'adts',
						description: 'AAC streaming format',
					},
					{
						name: 'PCM 16-Bit',
						value: 'pcm_s16le',
						description: 'Raw PCM 16-bit little-endian',
					},
				],
				description: 'Audio output format',
			},
			{
				displayName: 'Put Output in Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize', 'translatedTts', 'generateSound', 'separateAudio'],
					},
				},
				hint: 'The name of the output binary field to put the audio file in',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['synthesize'],
					},
				},
				options: [
					{
						displayName: 'User Instructions',
						name: 'userInstructions',
						type: 'string',
						typeOptions: {
							rows: 2,
						},
						default: '',
						description:
							'Style/tone guidance for the voice (3-1000 chars, requires mars-instruct model)',
					},
					{
						displayName: 'Enhance Named Entities',
						name: 'enhanceNamedEntities',
						type: 'boolean',
						default: false,
						description: 'Whether to enhance pronunciation of named entities',
					},
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						placeholder: 'audio.wav',
						description: 'Custom file name for the output audio file',
					},
				],
			},

			// ============================
			// TRANSLATED TTS PARAMETERS
			// ============================
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['translatedTts'],
					},
				},
				description: 'Text to translate and convert to speech',
			},
			{
				displayName: 'Source Language ID',
				name: 'sourceLanguage',
				type: 'number',
				default: 1,
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['translatedTts'],
					},
				},
				description: 'Language ID of input text (1=English)',
			},
			{
				displayName: 'Target Language ID',
				name: 'targetLanguage',
				type: 'number',
				default: 1,
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['translatedTts'],
					},
				},
				description: 'Language ID for output speech',
			},
			{
				displayName: 'Voice ID',
				name: 'voiceId',
				type: 'number',
				default: 147320,
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['translatedTts'],
					},
				},
				description: 'Voice ID for the target language',
			},
	
			// ============================
			// GENERATE SOUND PARAMETERS
			// ============================
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['generateSound'],
					},
				},
				description: 'Description of the sound to generate',
			},
			{
				displayName: 'Audio Type',
				name: 'audioType',
				type: 'options',
				options: [
					{ name: 'Sound Effect', value: 'sound' },
					{ name: 'Music', value: 'music' },
				],
				default: 'sound',
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['generateSound'],
					},
				},
				description: 'Type of audio to generate',
			},
			{
				displayName: 'Duration (Seconds)',
				name: 'duration',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 10,
				},
				default: 8,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['generateSound'],
					},
				},
				description: 'Duration of generated audio (max 10 seconds)',
			},

			// ============================
			// SEPARATE AUDIO PARAMETERS
			// ============================
			{
				displayName: 'Input Binary Field',
				name: 'inputBinaryField',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['audio'],
						operation: ['separateAudio'],
					},
				},
				description: 'Name of the binary field containing the audio file',
			},

			// ============================
			// TRANSCRIBE PARAMETERS
			// ============================
			{
				displayName: 'Input Binary Field',
				name: 'inputBinaryField',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['text'],
						operation: ['transcribe'],
					},
				},
				description: 'Name of the binary field containing the audio/video file',
			},
			{
				displayName: 'Language ID',
				name: 'languageId',
				type: 'number',
				default: 1,
				required: true,
				displayOptions: {
					show: {
						resource: ['text'],
						operation: ['transcribe'],
					},
				},
				description: 'Language ID for transcription (1=English)',
			},

			// ============================
			// TRANSLATE PARAMETERS
			// ============================
			{
				displayName: 'Text(s)',
				name: 'texts',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['text'],
						operation: ['translate'],
					},
				},
				description: 'Text to translate. Use JSON array for multiple texts: ["text1", "text2"].',
			},
			{
				displayName: 'Source Language ID',
				name: 'sourceLanguage',
				type: 'number',
				default: 1,
				required: true,
				displayOptions: {
					show: {
						resource: ['text'],
						operation: ['translate'],
					},
				},
				description: 'Language ID of input text (1=English)',
			},
			{
				displayName: 'Target Language ID',
				name: 'targetLanguage',
				type: 'number',
				default: 1,
				required: true,
				displayOptions: {
					show: {
						resource: ['text'],
						operation: ['translate'],
					},
				},
				description: 'Language ID for translation output',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['text'],
						operation: ['translate'],
					},
				},
				options: [
					{
						displayName: 'Formality',
						name: 'formality',
						type: 'options',
						options: [
							{ name: 'Formal', value: 1 },
							{ name: 'Informal', value: 2 },
						],
						default: 1,
						description: 'Translation formality level',
					},
				],
			},

			// ============================
			// CREATE VOICE PARAMETERS
			// ============================
			{
				displayName: 'Sample Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['createVoice'],
					},
				},
				description: 'Sample text the synthetic voice will speak',
			},
			{
				displayName: 'Voice Description',
				name: 'voiceDescription',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['createVoice'],
					},
				},
				placeholder: 'A warm, friendly female voice with a slight British accent...',
				description: 'Detailed description of desired voice (minimum 18 words / 100+ characters)',
			},
			{
				displayName: 'Put Output in Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['createVoice'],
					},
				},
				hint: 'The name of the output binary field to put the voice preview audio in',
			},

			// ============================
			// CLONE VOICE PARAMETERS
			// ============================
			{
				displayName: 'Input Binary Field',
				name: 'inputBinaryField',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['cloneVoice'],
					},
				},
				description: 'Name of the binary field containing the audio sample (30-60 seconds recommended)',
			},
			{
				displayName: 'Voice Name',
				name: 'voiceName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['cloneVoice'],
					},
				},
				placeholder: 'My Custom Voice',
				description: 'Name to assign to the cloned voice',
			},
			{
				displayName: 'Gender',
				name: 'gender',
				type: 'options',
				options: [
					{ name: 'Male', value: 1 },
					{ name: 'Female', value: 2 },
				],
				default: 1,
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['cloneVoice'],
					},
				},
				description: 'Gender of the voice',
			},
			{
				displayName: 'Age',
				name: 'age',
				type: 'number',
				default: 30,
				required: true,
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['cloneVoice'],
					},
				},
				description: 'Approximate age of the speaker',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['voice'],
						operation: ['cloneVoice'],
					},
				},
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						typeOptions: {
							rows: 2,
						},
						default: '',
						description: 'Detailed description of the voice',
					},
					{
						displayName: 'Language ID',
						name: 'language',
						type: 'number',
						default: 1,
						description: 'Language ID of the voice (1=English)',
					},
					{
						displayName: 'Enhance Audio',
						name: 'enhanceAudio',
						type: 'boolean',
						default: true,
						description: 'Whether to enhance the reference audio for better cloning accuracy',
					},
				],
			},
		],
	};


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				// ==================
				// AUDIO: SYNTHESIZE
				// ==================
				if (resource === 'audio' && operation === 'synthesize') {
					const text = this.getNodeParameter('text', i) as string;
					const voiceId = this.getNodeParameter('voiceId', i) as number;
					const language = this.getNodeParameter('language', i) as string;
					const model = this.getNodeParameter('model', i) as string;
					const outputFormat = this.getNodeParameter('outputFormat', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const options = this.getNodeParameter('options', i) as IDataObject;

					if (text.length < 3 || text.length > 3000) {
						throw new NodeOperationError(
							this.getNode(),
							'Text must be between 3 and 3000 characters',
							{ itemIndex: i },
						);
					}

					const body: IDataObject = {
						text,
						voice_id: voiceId,
						language,
						speech_model: model,
						enhance_named_entities_pronunciation: options.enhanceNamedEntities || false,
						output_configuration: {
							format: outputFormat,
						},
					};

					if (options.userInstructions) {
						body.user_instructions = options.userInstructions;
					}

					const response = (await cambAiApiRequest.call(this, 'POST', '/tts-stream', body, {}, {
						timeout: 60000,
						encoding: 'arraybuffer',
						returnFullResponse: true,
						json: false,
					})) as { body: Buffer; headers: Record<string, string> };

					let audioBuffer = Buffer.from(response.body);
					const sampleRate = MODEL_SAMPLE_RATES[model] || 22050;

					if (outputFormat === 'pcm_s16le') {
						const wavHeader = generateWavHeader(audioBuffer.length, sampleRate, 1, 16);
						audioBuffer = Buffer.concat([wavHeader, audioBuffer]);
					}

					const mimeTypes: Record<string, string> = {
						wav: 'audio/wav',
						flac: 'audio/flac',
						adts: 'audio/aac',
						pcm_s16le: 'audio/wav',
					};
					const extensions: Record<string, string> = {
						wav: 'wav',
						flac: 'flac',
						adts: 'aac',
						pcm_s16le: 'wav',
					};

					const mimeType = mimeTypes[outputFormat] || 'audio/wav';
					const extension = extensions[outputFormat] || 'wav';
					const fileName = (options.fileName as string) || `tts_output.${extension}`;

					const binaryData = await this.helpers.prepareBinaryData(audioBuffer, fileName, mimeType);

					returnData.push({
						json: { text, voiceId, language, model, outputFormat, fileName, size: audioBuffer.length },
						binary: { [binaryPropertyName]: binaryData },
						pairedItem: { item: i },
					});
				}

				// ==================
				// AUDIO: TRANSLATED TTS
				// ==================
				else if (resource === 'audio' && operation === 'translatedTts') {
					const text = this.getNodeParameter('text', i) as string;
					const sourceLanguage = this.getNodeParameter('sourceLanguage', i) as number;
					const targetLanguage = this.getNodeParameter('targetLanguage', i) as number;
					const voiceId = this.getNodeParameter('voiceId', i) as number;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

					const body: IDataObject = {
						text,
						source_language: sourceLanguage,
						target_language: targetLanguage,
					};

					// voice_id is optional
					if (voiceId) {
						body.voice_id = voiceId;
					}

					const response = await cambAiApiRequest.call(this, 'POST', '/translated-tts', body);
					const taskId = (response as IDataObject).task_id as string;

					// Poll for completion
					const result = await pollForResult.call(this, `/translated-tts/${taskId}`);
					const runId = (result as IDataObject).run_id as string;

					// Fetch the audio using run_id
					const audioResponse = (await cambAiApiRequest.call(
						this,
						'GET',
						`/tts-result/${runId}`,
						{},
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							json: false,
						},
					)) as { body: Buffer };

					const audioBuffer = Buffer.from(audioResponse.body);
					const fileName = `translated_tts_${taskId}.wav`;
					const binaryData = await this.helpers.prepareBinaryData(audioBuffer, fileName, 'audio/wav');

					returnData.push({
						json: { taskId, runId, text, sourceLanguage, targetLanguage, size: audioBuffer.length },
						binary: { [binaryPropertyName]: binaryData },
						pairedItem: { item: i },
					});
				}

				// ==================
				// AUDIO: GENERATE SOUND
				// ==================
				else if (resource === 'audio' && operation === 'generateSound') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const audioType = this.getNodeParameter('audioType', i) as string;
					const duration = this.getNodeParameter('duration', i) as number;
					const outputFormat = this.getNodeParameter('outputFormat', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

					const body: IDataObject = {
						prompt,
						audio_type: audioType,
						duration,
					};

					const response = await cambAiApiRequest.call(this, 'POST', '/text-to-sound', body);
					const taskId = (response as IDataObject).task_id as string;

					// Poll for result - returns run_id when SUCCESS
					const result = await pollForResult.call(this, `/text-to-sound/${taskId}`);
					const runId = (result as IDataObject).run_id as string;

					// Fetch the actual audio using run_id
					const audioResponse = (await cambAiApiRequest.call(
						this,
						'GET',
						`/text-to-sound-result/${runId}`,
						{},
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							json: false,
						},
					)) as { body: Buffer };

					const audioBuffer = Buffer.from(audioResponse.body);
					const mimeTypes: Record<string, string> = {
						wav: 'audio/wav',
						flac: 'audio/flac',
						adts: 'audio/aac',
						pcm_s16le: 'audio/wav',
					};
					const extensions: Record<string, string> = {
						wav: 'wav',
						flac: 'flac',
						adts: 'aac',
						pcm_s16le: 'wav',
					};

					const mimeType = mimeTypes[outputFormat] || 'audio/wav';
					const extension = extensions[outputFormat] || 'wav';
					const fileName = `sound_${taskId}.${extension}`;

					const binaryData = await this.helpers.prepareBinaryData(audioBuffer, fileName, mimeType);

					returnData.push({
						json: { taskId, runId, prompt, audioType, duration, size: audioBuffer.length },
						binary: { [binaryPropertyName]: binaryData },
						pairedItem: { item: i },
					});
				}

				// ==================
				// AUDIO: SEPARATE AUDIO
				// ==================
				else if (resource === 'audio' && operation === 'separateAudio') {
					const inputBinaryField = this.getNodeParameter('inputBinaryField', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

					const binaryData = this.helpers.assertBinaryData(i, inputBinaryField);
					const buffer = await this.helpers.getBinaryDataBuffer(i, inputBinaryField);

					const formData = new FormData();
					formData.append('media_file', buffer, {
						filename: binaryData.fileName || 'audio.wav',
						contentType: binaryData.mimeType,
					});

					const response = await cambAiApiRequest.call(this, 'POST', '/audio-separation', {}, {}, {
						formData,
					});
					const taskId = (response as IDataObject).task_id as string;

					// Poll for result - returns run_id when SUCCESS
					const result = await pollForResult.call(this, `/audio-separation/${taskId}`);
					const runId = (result as IDataObject).run_id as string;

					// Fetch the audio URLs
					const audioResult = (await cambAiApiRequest.call(
						this,
						'GET',
						`/audio-separation-result/${runId}`,
					)) as IDataObject;

					// Download foreground audio
					const foregroundUrl = audioResult.foreground_audio_url as string;
					const backgroundUrl = audioResult.background_audio_url as string;

					// Fetch the foreground audio
					const foregroundResponse = (await cambAiApiRequest.call(
						this,
						'GET',
						foregroundUrl,
						{},
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							json: false,
							baseURL: '',
						},
					)) as { body: Buffer };

					const foregroundBuffer = Buffer.from(foregroundResponse.body);
					const foregroundBinary = await this.helpers.prepareBinaryData(
						foregroundBuffer,
						`foreground_${taskId}.wav`,
						'audio/wav',
					);

					// Fetch the background audio
					const backgroundResponse = (await cambAiApiRequest.call(
						this,
						'GET',
						backgroundUrl,
						{},
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							json: false,
							baseURL: '',
						},
					)) as { body: Buffer };

					const backgroundBuffer = Buffer.from(backgroundResponse.body);
					const backgroundBinary = await this.helpers.prepareBinaryData(
						backgroundBuffer,
						`background_${taskId}.wav`,
						'audio/wav',
					);

					returnData.push({
						json: { taskId, runId, foregroundUrl, backgroundUrl },
						binary: {
							[binaryPropertyName]: foregroundBinary,
							[`${binaryPropertyName}_background`]: backgroundBinary,
						},
						pairedItem: { item: i },
					});
				}

				// ==================
				// TEXT: TRANSCRIBE
				// ==================
				else if (resource === 'text' && operation === 'transcribe') {
					const inputBinaryField = this.getNodeParameter('inputBinaryField', i) as string;
					const languageId = this.getNodeParameter('languageId', i) as number;

					const binaryData = this.helpers.assertBinaryData(i, inputBinaryField);
					const buffer = await this.helpers.getBinaryDataBuffer(i, inputBinaryField);

					const formData = new FormData();
					formData.append('media_file', buffer, {
						filename: binaryData.fileName || 'audio.wav',
						contentType: binaryData.mimeType,
					});
					formData.append('language', String(languageId));

					const response = await cambAiApiRequest.call(this, 'POST', '/transcribe', {}, {}, {
						formData,
					});
					const taskId = (response as IDataObject).task_id as string;

					// Poll for result - get run_id when SUCCESS
					const pollResult = await pollForResult.call(this, `/transcribe/${taskId}`);
					const runId = (pollResult as IDataObject).run_id as string;

					// Fetch the actual transcription result
					const transcriptResult = (await cambAiApiRequest.call(
						this,
						'GET',
						`/transcription-result/${runId}`,
						{},
						{ data_type: 'json', format_type: 'txt' },
					)) as IDataObject;

					// API returns { transcript: [{ start, end, text, speaker }, ...] }
					const segments = (transcriptResult.transcript || []) as Array<{
						start: number;
						end: number;
						text: string;
						speaker: string;
					}>;

					// Combined plain text transcript
					const transcript = segments.map((s) => s.text).join(' ');

					returnData.push({
						json: {
							taskId,
							runId,
							languageId,
							transcript,
							segments,
						},
						pairedItem: { item: i },
					});
				}

				// ==================
				// TEXT: TRANSLATE
				// ==================
				else if (resource === 'text' && operation === 'translate') {
					const textsInput = this.getNodeParameter('texts', i) as string;
					const sourceLanguage = this.getNodeParameter('sourceLanguage', i) as number;
					const targetLanguage = this.getNodeParameter('targetLanguage', i) as number;
					const options = this.getNodeParameter('options', i) as IDataObject;

					// Parse texts - could be JSON array or single string
					let texts: string[];
					try {
						texts = JSON.parse(textsInput);
						if (!Array.isArray(texts)) {
							texts = [textsInput];
						}
					} catch {
						texts = [textsInput];
					}

					const body: IDataObject = {
						texts,
						source_language: sourceLanguage,
						target_language: targetLanguage,
					};

					if (options.formality) {
						body.formality = options.formality;
					}

					const response = await cambAiApiRequest.call(this, 'POST', '/translate', body);
					const taskId = (response as IDataObject).task_id as string;

					// Poll for result - returns run_id when SUCCESS
					const result = await pollForResult.call(this, `/translate/${taskId}`);
					const runId = (result as IDataObject).run_id as string;

					// Fetch the actual translation result
					const translationResult = (await cambAiApiRequest.call(
						this,
						'GET',
						`/translation-result/${runId}`,
					)) as IDataObject;

					const translatedTexts = translationResult.texts as string[];

					returnData.push({
						json: {
							taskId,
							runId,
							sourceLanguage,
							targetLanguage,
							originalTexts: texts,
							translatedTexts,
						},
						pairedItem: { item: i },
					});
				}

				// ==================
				// VOICE: CREATE
				// ==================
				else if (resource === 'voice' && operation === 'createVoice') {
					const text = this.getNodeParameter('text', i) as string;
					const voiceDescription = this.getNodeParameter('voiceDescription', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;

					if (voiceDescription.length < 100) {
						throw new NodeOperationError(
							this.getNode(),
							'Voice description must be at least 100 characters (18+ words)',
							{ itemIndex: i },
						);
					}

					const body: IDataObject = {
						text,
						voice_description: voiceDescription,
					};

					const response = await cambAiApiRequest.call(this, 'POST', '/text-to-voice', body);
					const taskId = (response as IDataObject).task_id as string;

					// Poll for result - returns run_id when SUCCESS
					const result = await pollForResult.call(this, `/text-to-voice/${taskId}`);
					const runId = (result as IDataObject).run_id as string;

					// Fetch the preview URLs
					const voiceResult = (await cambAiApiRequest.call(
						this,
						'GET',
						`/text-to-voice-result/${runId}`,
					)) as IDataObject;

					const previews = voiceResult.previews as string[];

					// Download preview 1 as binary
					const preview1Response = (await cambAiApiRequest.call(
						this,
						'GET',
						previews[0],
						{},
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							json: false,
							baseURL: '',
						},
					)) as { body: Buffer };

					const preview1Buffer = Buffer.from(preview1Response.body);
					const preview1Binary = await this.helpers.prepareBinaryData(
						preview1Buffer,
						`voice_preview_1_${runId}.mp3`,
						'audio/mpeg',
					);

					// Download preview 2 as binary
					const preview2Response = (await cambAiApiRequest.call(
						this,
						'GET',
						previews[1],
						{},
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							json: false,
							baseURL: '',
						},
					)) as { body: Buffer };

					const preview2Buffer = Buffer.from(preview2Response.body);
					const preview2Binary = await this.helpers.prepareBinaryData(
						preview2Buffer,
						`voice_preview_2_${runId}.mp3`,
						'audio/mpeg',
					);

					returnData.push({
						json: {
							taskId,
							runId,
							voiceDescription,
							previewUrls: previews,
						},
						binary: {
							[binaryPropertyName]: preview1Binary,
							[`${binaryPropertyName}_preview2`]: preview2Binary,
						},
						pairedItem: { item: i },
					});
				}

				// ==================
				// VOICE: CLONE
				// ==================
				else if (resource === 'voice' && operation === 'cloneVoice') {
					const inputBinaryField = this.getNodeParameter('inputBinaryField', i) as string;
					const voiceName = this.getNodeParameter('voiceName', i) as string;
					const gender = this.getNodeParameter('gender', i) as number;
					const age = this.getNodeParameter('age', i) as number;
					const options = this.getNodeParameter('options', i) as IDataObject;

					const binaryData = this.helpers.assertBinaryData(i, inputBinaryField);
					const buffer = await this.helpers.getBinaryDataBuffer(i, inputBinaryField);

					const formData = new FormData();
					formData.append('file', buffer, {
						filename: binaryData.fileName || 'voice_sample.wav',
						contentType: binaryData.mimeType,
					});
					formData.append('voice_name', voiceName);
					formData.append('gender', String(gender));
					formData.append('age', String(age));

					if (options.description) {
						formData.append('description', String(options.description));
					}
					if (options.language) {
						formData.append('language', String(options.language));
					}
					if (options.enhanceAudio !== undefined) {
						formData.append('enhance_audio', String(options.enhanceAudio));
					}

					const response = await cambAiApiRequest.call(this, 'POST', '/create-custom-voice', {}, {}, {
						formData,
					});

					const result = response as IDataObject;

					returnData.push({
						json: {
							voiceId: result.voice_id,
							voiceName,
							gender,
							age,
							...result,
						},
						pairedItem: { item: i },
					});
				}

				// ==================
				// VOICE: LIST
				// ==================
				else if (resource === 'voice' && operation === 'listVoices') {
					const voices = await cambAiApiRequest.call(this, 'GET', '/list-voices');

					if (Array.isArray(voices)) {
						for (const voice of voices) {
							returnData.push({
								json: voice as IDataObject,
								pairedItem: { item: i },
							});
						}
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
