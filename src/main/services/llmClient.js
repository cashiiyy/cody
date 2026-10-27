'use strict';

const OpenAI = require('openai').default || require('openai');
const logger = require('../utils/logger');
const settingsManager = require('./settingsManager');

class LLMClient {
  constructor() {
    this._client = null;
    this._currentEndpoint = null;
    this._abortControllers = new Map(); // requestId → AbortController
  }

  _buildClient(endpoint) {
    return new OpenAI({
      baseURL: endpoint,
      apiKey: 'lm-studio-local', // placeholder, LM Studio doesn't check it
      timeout: settingsManager.get().requestTimeoutMs || 120000,
      maxRetries: 0, // we handle retries ourselves
    });
  }

  _getClient() {
    const settings = settingsManager.get();
    const endpoint = settings.lmStudioEndpoint;
    if (!this._client || this._currentEndpoint !== endpoint) {
      this._client = this._buildClient(endpoint);
      this._currentEndpoint = endpoint;
    }
    return this._client;
  }

  async testConnection() {
    const settings = settingsManager.get();
    const endpoint = settings.lmStudioEndpoint;
    try {
      const client = this._getClient();
      const response = await client.models.list();
      const models = response.data || [];
      logger.info('LM Studio connection OK', { endpoint, models: models.map(m => m.id) });
      return {
        connected: true,
        endpoint,
        models: models.map(m => ({ id: m.id, name: m.id })),
        error: null,
      };
    } catch (err) {
      logger.warn('LM Studio connection failed', { endpoint, error: err.message });
      return {
        connected: false,
        endpoint,
        models: [],
        error: this._friendlyError(err),
      };
    }
  }

  async listModels() {
    const result = await this.testConnection();
    return result.models;
  }

  /**
   * Stream a chat completion.
   * Calls onToken(chunk: string) for each token delta.
   * Calls onComplete(fullText: string) when done.
   * Calls onError(err: Error) on failure.
   * Returns a cancel() function.
   */
  async streamChat({ requestId, messages, onToken, onComplete, onError }) {
    const settings = settingsManager.get();
    const model = settings.activeModel;
    if (!model) {
      onError(new Error('No model selected. Go to Settings and pick an active model.'));
      return () => {};
    }

    const controller = new AbortController();
    this._abortControllers.set(requestId, controller);

    let fullText = '';
    let cancelled = false;

    const cleanup = () => {
      this._abortControllers.delete(requestId);
    };

    try {
      const client = this._getClient();
      const stream = await client.chat.completions.create(
        {
          model,
          messages,
          temperature: settings.temperature,
          max_tokens: settings.maxOutputTokens,
          stream: true,
        },
        { signal: controller.signal }
      );

      for await (const chunk of stream) {
        if (cancelled) break;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onToken(delta);
        }
        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason && finishReason !== 'stop' && finishReason !== 'null') {
          logger.debug('Stream finish reason', { finishReason });
        }
      }

      if (!cancelled) {
        cleanup();
        onComplete(fullText);
      }
    } catch (err) {
      cleanup();
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        cancelled = true;
        onComplete(fullText); // return what we have
        return () => {};
      }
      logger.error('Stream error', { requestId, error: err.message });
      onError(new Error(this._friendlyError(err)));
    }

    return () => {
      cancelled = true;
      const ctrl = this._abortControllers.get(requestId);
      if (ctrl) {
        ctrl.abort();
        this._abortControllers.delete(requestId);
        logger.info('Stream cancelled', { requestId });
      }
    };
  }

  cancelRequest(requestId) {
    const ctrl = this._abortControllers.get(requestId);
    if (ctrl) {
      ctrl.abort();
      this._abortControllers.delete(requestId);
      return true;
    }
    return false;
  }

  _friendlyError(err) {
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      return 'Unable to connect to LM Studio. Ensure the local server is running on port 1234 and a model is loaded.';
    }
    if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
      return 'Request timed out. The model may be loading or the context is too large.';
    }
    if (err.status === 404) {
      return 'Model not found. Ensure the correct model is loaded in LM Studio.';
    }
    if (err.status === 400) {
      return `Bad request: ${err.message}. Check context window settings.`;
    }
    return err.message || 'Unknown LM Studio error';
  }
}

const llmClient = new LLMClient();
module.exports = llmClient;
