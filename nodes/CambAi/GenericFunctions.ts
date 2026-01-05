import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const BASE_URL = 'https://client.camb.ai/apis';

export async function cambAiApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	options: IDataObject = {},
): Promise<unknown> {
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${endpoint}`,
		json: true,
	};

	if (Object.keys(body).length > 0) {
		requestOptions.body = body;
	}

	if (Object.keys(qs).length > 0) {
		requestOptions.qs = qs;
	}

	// Apply additional options (timeout, encoding, etc.)
	Object.assign(requestOptions, options);

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'cambAiApi',
			requestOptions,
		);

		return response;
	} catch (error) {
		// Enhance error messages for common cases
		const err = error as { statusCode?: number; message?: string };

		if (err.statusCode === 401) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: 'Invalid API key. Please check your Camb.ai credentials.',
			});
		}

		if (err.statusCode === 429) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: 'Rate limit exceeded. Please wait before making more requests.',
			});
		}

		if (err.statusCode === 400) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: `Bad request: ${err.message || 'Invalid parameters'}`,
			});
		}

		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * Generate a WAV header for raw PCM audio data
 * @param dataLength Length of audio data in bytes
 * @param sampleRate Sample rate (default: 24000 Hz for Camb.ai)
 * @param numChannels Number of channels (default: 1 for mono)
 * @param bitsPerSample Bits per sample (default: 16)
 */
export function generateWavHeader(
	dataLength: number,
	sampleRate: number = 24000,
	numChannels: number = 1,
	bitsPerSample: number = 16,
): Buffer {
	const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
	const blockAlign = numChannels * (bitsPerSample / 8);
	const fileSize = 36 + dataLength;

	const header = Buffer.alloc(44);

	// RIFF chunk descriptor
	header.write('RIFF', 0);
	header.writeUInt32LE(fileSize, 4);
	header.write('WAVE', 8);

	// fmt sub-chunk
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
	header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
	header.writeUInt16LE(numChannels, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(byteRate, 28);
	header.writeUInt16LE(blockAlign, 32);
	header.writeUInt16LE(bitsPerSample, 34);

	// data sub-chunk
	header.write('data', 36);
	header.writeUInt32LE(dataLength, 40);

	return header;
}
