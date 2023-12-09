import shaderSource from "./shaders/shader.wgsl?raw";
import texture from "./texture.png";
import { createTextureFromURL, initializeGpu } from "./utils";

const createVertexBuffer = (
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

const createIndexBuffer = (device: GPUDevice, data: Uint16Array): GPUBuffer => {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Uint16Array(buffer.getMappedRange()).set(data);
  buffer.unmap();

  return buffer;
};

const main = async () => {
  const { device, context } = await initializeGpu();

  const testTexture = await createTextureFromURL(device, texture);

  const positionBuffer = createVertexBuffer(
    device,
    new Float32Array([
      -0.5,
      -0.5, // x, y
      0.5,
      -0.5,
      -0.5,
      0.5,
      0.5,
      0.5,
    ])
  );
  const colorsBuffer = createVertexBuffer(
    device,
    new Float32Array([
      1.0,
      1.0,
      1.0, // r g b
      1.0,
      1.0,
      1.0, // r g b
      1.0,
      1.0,
      1.0, // r g b
      1.0,
      1.0,
      1.0, // r g b
    ])
  );
  const texCoordsBuffer = createVertexBuffer(
    device,
    new Float32Array([
      0.0,
      1.0, // u, v
      1.0,
      1.0,
      0.0,
      0.0,
      1.0,
      0.0,
    ])
  );

  const indexBuffer = createIndexBuffer(
    device,
    new Uint16Array([0, 1, 2, 1, 2, 3])
  );

  const shaderModule = device.createShaderModule({
    code: shaderSource,
  });

  const positionBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT, // 2 floats * 4 bytes per float
    attributes: [
      {
        shaderLocation: 0,
        offset: 0,
        format: "float32x2", // 2 floats
      },
    ],
    stepMode: "vertex",
  };

  const colorBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT, // rgb * 4 bytes per float
    attributes: [
      {
        shaderLocation: 1,
        offset: 0,
        format: "float32x3", // 3 floats
      },
    ],
    stepMode: "vertex",
  };

  const textureCoordsLayout: GPUVertexBufferLayout = {
    arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT, // 2 floats * 4 bytes per float
    attributes: [
      {
        shaderLocation: 2,
        offset: 0,
        format: "float32x2", // 2 floats
      },
    ],
    stepMode: "vertex",
  };

  const vertexState: GPUVertexState = {
    module: shaderModule,
    entryPoint: "vertexMain", // name of the entry point function for vertex shader, must be same as in shader
    buffers: [positionBufferLayout, colorBufferLayout, textureCoordsLayout],
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
    bindGroupLayouts: [textureBindGroupLayout],
  });

  const textureBindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: testTexture.sampler,
      },
      {
        binding: 1,
        resource: testTexture.texture.createView(),
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

    // DRAW HERE
    passEncoder.setPipeline(pipeline);
    passEncoder.setIndexBuffer(indexBuffer, "uint16");
    passEncoder.setVertexBuffer(0, positionBuffer);
    passEncoder.setVertexBuffer(1, colorsBuffer);
    passEncoder.setVertexBuffer(2, texCoordsBuffer);
    passEncoder.setBindGroup(0, textureBindGroup);
    passEncoder.drawIndexed(6); // draw 3 vertices
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
