import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { cambAiApiRequest, generateWavHeader } from './GenericFunctions';

export class CambAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Camb.ai',
		name: 'cambAi',
		icon: 'file:cambai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate speech from text using Camb.ai MARS TTS models',
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
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Synthesize',
						value: 'synthesize',
						description: 'Convert text to speech audio',
						action: 'Synthesize text to speech',
					},
				],
				default: 'synthesize',
			},
			// Synthesize parameters
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
						operation: ['synthesize'],
					},
				},
				description: 'Text to convert to speech (3-3000 characters)',
			},
			{
				displayName: 'Voice Name or ID',
				name: 'voice',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getVoices',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['synthesize'],
					},
				},
				description:
					'Voice to use for synthesis. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'mars-8-flash',
				displayOptions: {
					show: {
						operation: ['synthesize'],
					},
				},
				options: [
					{
						name: 'MARS-8',
						value: 'mars-8',
						description: 'High quality model',
					},
					{
						name: 'MARS-8 Flash',
						value: 'mars-8-flash',
						description: 'Fast, balanced quality model (recommended)',
					},
					{
						name: 'MARS-8 Instruct',
						value: 'mars-8-instruct',
						description: 'Model that follows user instructions',
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
						operation: ['synthesize'],
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
						description: 'FLAC audio format',
					},
					{
						name: 'AAC (ADTS)',
						value: 'adts',
						description: 'AAC audio in ADTS container',
					},
					{
						name: 'PCM (Raw)',
						value: 'pcm_s16le',
						description: 'Raw PCM 16-bit little-endian audio',
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
						operation: ['synthesize'],
					},
				},
				hint: 'The name of the output binary field to put the audio file in',
			},
			// Voice options (collection)
			{
				displayName: 'Voice Options',
				name: 'voiceOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['synthesize'],
					},
				},
				options: [
					{
						displayName: 'Speed',
						name: 'speed',
						type: 'number',
						typeOptions: {
							minValue: 0.5,
							maxValue: 2.0,
							numberStepSize: 0.1,
						},
						default: 1.0,
						description: 'Speaking speed (0.5-2.0, where 1.0 is normal)',
					},
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						placeholder: 'e.g., en-US, es-ES',
						description: 'BCP-47 language code for synthesis (e.g., en-US, es-ES)',
					},
					{
						displayName: 'User Instructions',
						name: 'userInstructions',
						type: 'string',
						typeOptions: {
							rows: 2,
						},
						default: '',
						description:
							'Custom instructions for voice behavior (works best with mars-8-instruct model)',
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
		],
	};

	methods = {
		loadOptions: {
			async getVoices(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const voices = (await cambAiApiRequest.call(this, 'GET', '/list-voices')) as Array<{
					id: string;
					name: string;
				}>;

				return voices.map((voice) => ({
					name: voice.name,
					value: voice.id,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'synthesize') {
					const text = this.getNodeParameter('text', i) as string;
					const voice = this.getNodeParameter('voice', i) as string;
					const model = this.getNodeParameter('model', i) as string;
					const outputFormat = this.getNodeParameter('outputFormat', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const voiceOptions = this.getNodeParameter('voiceOptions', i) as IDataObject;

					// Validate text length
					if (text.length < 3 || text.length > 3000) {
						throw new NodeOperationError(
							this.getNode(),
							'Text must be between 3 and 3000 characters',
							{ itemIndex: i },
						);
					}

					// Build request body
					const body: IDataObject = {
						text,
						voice,
						model,
						output_format: outputFormat,
					};

					// Add optional voice parameters
					if (voiceOptions.speed !== undefined) {
						body.speed = voiceOptions.speed;
					}
					if (voiceOptions.language) {
						body.language = voiceOptions.language;
					}
					if (voiceOptions.userInstructions) {
						body.user_instructions = voiceOptions.userInstructions;
					}

					// Make TTS request with 60s timeout
					const response = (await cambAiApiRequest.call(this, 'POST', '/tts-stream', body, {}, {
						timeout: 60000,
						encoding: 'arraybuffer',
						returnFullResponse: true,
						json: false,
					})) as { body: Buffer; headers: Record<string, string> };

					let audioBuffer = Buffer.from(response.body);

					// Generate WAV header for PCM output
					if (outputFormat === 'pcm_s16le') {
						const wavHeader = generateWavHeader(audioBuffer.length, 24000, 1, 16);
						audioBuffer = Buffer.concat([wavHeader, audioBuffer]);
					}

					// Determine MIME type and file extension
					const mimeTypes: Record<string, string> = {
						wav: 'audio/wav',
						flac: 'audio/flac',
						adts: 'audio/aac',
						pcm_s16le: 'audio/wav', // After adding WAV header
					};

					const extensions: Record<string, string> = {
						wav: 'wav',
						flac: 'flac',
						adts: 'aac',
						pcm_s16le: 'wav',
					};

					const mimeType = mimeTypes[outputFormat] || 'audio/wav';
					const extension = extensions[outputFormat] || 'wav';
					const fileName = (voiceOptions.fileName as string) || `tts_output.${extension}`;

					// Prepare binary data
					const binaryData = await this.helpers.prepareBinaryData(audioBuffer, fileName, mimeType);

					returnData.push({
						json: {
							text,
							voice,
							model,
							outputFormat,
							fileName,
							size: audioBuffer.length,
						},
						binary: {
							[binaryPropertyName]: binaryData,
						},
						pairedItem: { item: i },
					});
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
