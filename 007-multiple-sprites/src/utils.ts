import { mat4 } from "gl-matrix";

export const initializeGpu = async () => {
  const canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  const context = canvas.getContext("webgpu") as GPUCanvasContext;

  if (!context) {
    console.error("WebGPU not supported");
    alert("WebGPU not supported");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    throw new Error("No adapter found");
  }

  const device = await adapter.requestDevice();

  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
  });

  return { context, device, canvas };
};

export const createBuffer = (
  device: GPUDevice,
  data: Float32Array
): GPUBuffer => {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();

  return buffer;
};

const createTexture = async (
  device: GPUDevice,
  image: HTMLImageElement
): Promise<any> => {
  const texture = device.createTexture({
    size: { width: image.width, height: image.height },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const data = await createImageBitmap(image);

  device.queue.copyExternalImageToTexture(
    { source: data },
    { texture: texture },
    { width: image.width, height: image.height }
  );

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  return { texture, sampler };
};

/**
 * Load a texture from a URL
 * @param device
 * @param url
 * @returns
 */
export const createTextureFromURL = async (
  device: GPUDevice,
  url: string
): Promise<any> => {
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.src = url;
    image.onload = () => resolve(image);
    image.onerror = () => {
      console.error(`Failed to load image ${url}`);
      reject();
    };
  });

  const image = await promise;
  return await createTexture(device, image);
};

export const createVertexBuffer = (
  device: GPUDevice,
  data: Float32Array
): GPUBuffer => {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();

  return buffer;
};

export const createIndexBuffer = (
  device: GPUDevice,
  data: Uint16Array
): GPUBuffer => {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Uint16Array(buffer.getMappedRange()).set(data);
  buffer.unmap();

  return buffer;
};

export const createUniformBuffer = (
  device: GPUDevice,
  data: Float32Array
): GPUBuffer => {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return buffer;
};

export class Camera {
  private projection!: mat4;
  private view!: mat4;

  public projectionViewMatrix: mat4;

  constructor(public width: number, public height: number) {
    this.projectionViewMatrix = mat4.create();
  }

  public update() {
    this.projection = mat4.ortho(
      mat4.create(),
      0,
      this.width,
      this.height,
      0,
      -1,
      1
    );
    this.view = mat4.lookAt(mat4.create(), [0, 0, 1], [0, 0, 0], [0, 1, 0]);

    mat4.multiply(this.projectionViewMatrix, this.projection, this.view);
  }
}
