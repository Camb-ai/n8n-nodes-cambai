import FormData from 'form-data';
import type {
	IExecuteFunctions,
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const BASE_URL = 'https://client.camb.ai/apis';

export { FormData };

export async function cambAiApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	options: IDataObject = {},
): Promise<unknown> {
	// If baseURL is empty string, use endpoint as full URL (for external URLs)
	// Otherwise use the default BASE_URL
	const baseURL = options.baseURL !== undefined ? options.baseURL : BASE_URL;
	const url = baseURL === '' ? endpoint : `${baseURL}${endpoint}`;
	delete options.baseURL;

	const requestOptions: IHttpRequestOptions = {
		method,
		url,
		json: true,
	};

	if (Object.keys(body).length > 0) {
		requestOptions.body = body;
	}

	if (Object.keys(qs).length > 0) {
		requestOptions.qs = qs;
	}

	// Apply additional options (timeout, encoding, etc.)
	const { formData, ...restOptions } = options;
	Object.assign(requestOptions, restOptions);

	// If formData (FormData instance) is provided, set as body
	if (formData && formData instanceof FormData) {
		delete requestOptions.body;
		requestOptions.json = false;
		requestOptions.body = formData;
	}

	try {
		let response;
		// For external URLs (baseURL is ''), skip authentication
		if (baseURL === '') {
			response = await this.helpers.httpRequest(requestOptions);
		} else {
			response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'cambAiApi',
				requestOptions,
			);
		}

		return response;
	} catch (error) {
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
 * Poll for async task result until success or error
 * Status values from Camb.ai API:
 * - PENDING: Still processing, keep polling
 * - SUCCESS: Completed successfully
 * - ERROR: Task failed
 * - TIMEOUT: Server timeout
 * - PAYMENT_REQUIRED: Need credits
 *
 * @param endpoint The result endpoint to poll (e.g., /translate/{taskId})
 * @param interval Polling interval in ms (default: 3000 = 3 seconds)
 */
export async function pollForResult(
	this: IExecuteFunctions,
	endpoint: string,
	interval: number = 3000,
): Promise<IDataObject> {
	while (true) {
		try {
			const response = await cambAiApiRequest.call(this, 'GET', endpoint);
			const result = response as IDataObject;

			const status = (result.status || '').toString().toUpperCase();

			if (status === 'SUCCESS') {
				return result;
			}

			if (status === 'ERROR' || status === 'FAILED') {
				throw new Error(`Task failed: ${result.message || result.error || 'Unknown error'}`);
			}

			if (status === 'TIMEOUT') {
				throw new Error('Task timed out on the server. Try again or use smaller input.');
			}

			if (status === 'PAYMENT_REQUIRED') {
				throw new Error('Insufficient credits. Please check your Camb.ai account balance.');
			}

			// PENDING or any other status - keep polling
			await new Promise((resolve) => setTimeout(resolve, interval));
		} catch (error) {
			// If it's a 404, the task might not be ready yet - keep polling
			const err = error as { statusCode?: number; message?: string };
			if (err.statusCode === 404) {
				await new Promise((resolve) => setTimeout(resolve, interval));
				continue;
			}
			// Any other error is a real error - stop polling
			throw error;
		}
	}
}

/**
 * Generate a WAV header for raw PCM audio data
 * @param dataLength Length of audio data in bytes
 * @param sampleRate Sample rate in Hz
 * @param numChannels Number of channels (1 for mono)
 * @param bitsPerSample Bits per sample (16 for pcm_s16le)
 */
export function generateWavHeader(
	dataLength: number,
	sampleRate: number = 22050,
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
