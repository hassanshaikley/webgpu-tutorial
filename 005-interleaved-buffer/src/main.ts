import shaderSource from "./shaders/shader.wgsl?raw";
import texture from "./texture.png";
import {
  createIndexBuffer,
  createTextureFromURL,
  createVertexBuffer,
  initializeGpu,
} from "./utils";

const main = async () => {
  const { device, context } = await initializeGpu();
  const testTexture = await createTextureFromURL(device, texture);

  const verticesBuffer = createVertexBuffer(
    device,
    new Float32Array([
      // x y          u v          r g b
      -0.5, -0.5, 0.0, 1.0, 1.0, 1.0, 1.0, 0.5, -0.5, 1.0, 1.0, 1.0, 1.0, 1.0,
      -0.5, 0.5, 0.0, 0.0, 1.0, 1.0, 1.0, 0.5, 0.5, 1.0, 0.0, 1.0, 1.0, 1.0,
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
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.setBindGroup(0, textureBindGroup);
    passEncoder.drawIndexed(6); // draw 3 vertices
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
