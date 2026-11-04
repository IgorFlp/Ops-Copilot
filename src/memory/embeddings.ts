export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

export interface FeatureTensor {
  data: Float32Array;
  dims: number[];
}

export interface EmbeddingOptions {
  pooling: "mean";
  normalize: true;
}

export type FeatureExtractor = (
  text: string,
  options: EmbeddingOptions,
) => Promise<FeatureTensor>;

export type Embedder = (text: string) => Promise<Float32Array>;

async function loadFeatureExtractor(): Promise<FeatureExtractor> {
  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
  return async (text, options) => {
    const tensor = await extractor(text, options);
    if (!(tensor.data instanceof Float32Array)) {
      throw new TypeError("Embedding model must return Float32 data");
    }
    return { data: tensor.data, dims: tensor.dims };
  };
}

export function createEmbedder(
  loadExtractor: () => Promise<FeatureExtractor> = loadFeatureExtractor,
): Embedder {
  let extractorPromise: Promise<FeatureExtractor> | undefined;

  return async (text) => {
    if (!text.trim()) {
      throw new TypeError("Embedding input must not be empty");
    }
    extractorPromise ??= loadExtractor().catch((error: unknown) => {
      extractorPromise = undefined;
      throw error;
    });
    const extractor = await extractorPromise;
    const { data, dims } = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    if (
      dims.length !== 2 ||
      dims[0] !== 1 ||
      dims[1] !== EMBEDDING_DIMENSIONS ||
      data.length !== EMBEDDING_DIMENSIONS
    ) {
      throw new TypeError(
        `Embedding model must return a [1, ${EMBEDDING_DIMENSIONS}] tensor`,
      );
    }
    if (!data.every(Number.isFinite)) {
      throw new TypeError("Embedding model returned a non-finite value");
    }
    return data;
  };
}

export const embed = createEmbedder();
