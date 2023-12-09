import shaderSource from "./shaders/shader.wgsl?raw";
import texture from "./texture.png";
import shipTexture from "./ship.png";

import { mat4 } from "gl-matrix";

import {
  createIndexBuffer,
  createTextureFromURL,
  createVertexBuffer,
  initializeGpu,
} from "./utils";

const createUniformBuffer = (
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

const main = async () => {
  const { device, context, canvas } = await initializeGpu();
  const testTexture = await createTextureFromURL(device, texture);

  const playerTexture = await createTextureFromURL(device, shipTexture);

  const camera = new Camera(canvas.width, canvas.height);

  const x = 100;
  const y = 100;
  const w = 99;
  const h = 75;

  const verticesBuffer = createVertexBuffer(
    device,
    new Float32Array([
      // x y            u v           r g b
      x,
      y,
      0.0,
      0.0,
      1.0,
      1.0,
      1.0, // top left
      x + w,
      y,
      1.0,
      0.0,
      1.0,
      1.0,
      1.0, // top right
      x + w,
      y + h,
      1.0,
      1.0,
      1.0,
      1.0,
      1.0, // bottom right
      x,
      y + h,
      0.0,
      1.0,
      1.0,
      1.0,
      1.0, // bottom left
    ])
  );
  const indexBuffer = createIndexBuffer(
    device,
    new Uint16Array([0, 1, 2, 2, 3, 0])
  );

  const projectionViewMatrixBuffer = createUniformBuffer(
    device,
    new Float32Array(16)
  );
  const shaderModule = device.createShaderModule({
    code: shaderSource,
  });

  const positionBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 7 * Float32Array.BYTES_PER_ELEMENT, // 2 floats * 4 bytes per float
    attributes: [
      {
        shaderLocation: 0,
        offset: 0,
        format: "float32x2", // 2 floats
      },
      {
        shaderLocation: 1,
        offset: 2 * Float32Array.BYTES_PER_ELEMENT,
        format: "float32x2", // 2 floats
      },
      {
        shaderLocation: 2,
        offset: 4 * Float32Array.BYTES_PER_ELEMENT,
        format: "float32x3", // 3 floats
      },
    ],
    stepMode: "vertex",
  };

  const vertexState: GPUVertexState = {
    module: shaderModule,
    entryPoint: "vertexMain", // name of the entry point function for vertex shader, must be same as in shader
    buffers: [positionBufferLayout],
  };

  const fragmentState: GPUFragmentState = {
    module: shaderModule,
    entryPoint: "fragmentMain", // name of the entry point function for fragment/pixel shader, must be same as in shader
    targets: [
      {
        format: navigator.gpu.getPreferredCanvasFormat(),
        blend: {
          color: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
      },
    ],
  };

  const projectionViewBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const textureBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [projectionViewBindGroupLayout, textureBindGroupLayout],
  });

  const textureBindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: playerTexture.sampler,
      },
      {
        binding: 1,
        resource: playerTexture.texture.createView(),
      },
    ],
  });

  const projectionViewBindGroup = device.createBindGroup({
    layout: projectionViewBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: projectionViewMatrixBuffer,
        },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    vertex: vertexState,
    fragment: fragmentState,
    primitive: {
      topology: "triangle-list", // type of primitive to render
    },
    layout: pipelineLayout,
  });

  const draw = () => {
    camera.update();

    const commandEncoder = device.createCommandEncoder();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          clearValue: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
          view: context.getCurrentTexture().createView(),
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    device.queue.writeBuffer(
      projectionViewMatrixBuffer,
      0,
      camera.projectionViewMatrix as Float32Array
    );

    // DRAW HERE
    passEncoder.setPipeline(pipeline);
    passEncoder.setIndexBuffer(indexBuffer, "uint16");
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.setBindGroup(0, projectionViewBindGroup);
    passEncoder.setBindGroup(1, textureBindGroup);
    passEncoder.drawIndexed(6); // draw 3 vertices
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
