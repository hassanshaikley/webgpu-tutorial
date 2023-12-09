import shaderSource from "./shaders/shader.wgsl?raw";
import texture from "./texture.png";
import shipTexture from "./ship.png";
import ufoRedTexturex from "./ufoRed.png";

import {
  Camera,
  createIndexBuffer,
  createTextureFromURL,
  createUniformBuffer,
  createVertexBuffer,
  initializeGpu,
} from "./utils";

const vertexData: Float32Array = new Float32Array(7 * 4);

const drawSprite = (
  device: GPUDevice,
  texture: any,
  rect: Rect,
  projectionViewMatrixBuffer: GPUBuffer,
  indexBuffer: GPUBuffer,
  passEncoder,
  camera
) => {
  const spritePipeline = SpritePipeline.create(
    device,
    texture,
    projectionViewMatrixBuffer
  );

  // top left
  vertexData[0] = rect.x;
  vertexData[1] = rect.y;
  vertexData[2] = 0.0;
  vertexData[3] = 0.0;
  vertexData[4] = 1.0;
  vertexData[5] = 1.0;
  vertexData[6] = 1.0;

  // top right
  vertexData[7] = rect.x + rect.width;
  vertexData[8] = rect.y;
  vertexData[9] = 1.0;
  vertexData[10] = 0.0;
  vertexData[11] = 1.0;
  vertexData[12] = 1.0;
  vertexData[13] = 1.0;

  // bottom right
  vertexData[14] = rect.x + rect.width;
  vertexData[15] = rect.y + rect.height;
  vertexData[16] = 1.0;
  vertexData[17] = 1.0;
  vertexData[18] = 1.0;
  vertexData[19] = 1.0;
  vertexData[20] = 1.0;

  // bottom left
  vertexData[21] = rect.x;
  vertexData[22] = rect.y + rect.height;
  vertexData[23] = 0.0;
  vertexData[24] = 1.0;
  vertexData[25] = 1.0;
  vertexData[26] = 1.0;
  vertexData[27] = 1.0;

  const vertexBuffer = createVertexBuffer(device, vertexData);

  device.queue.writeBuffer(
    projectionViewMatrixBuffer,
    0,
    camera.projectionViewMatrix as Float32Array
  );

  // DRAW HERE
  passEncoder.setPipeline(spritePipeline.pipeline);
  passEncoder.setIndexBuffer(indexBuffer, "uint16");
  passEncoder.setVertexBuffer(0, vertexBuffer);
  passEncoder.setBindGroup(0, spritePipeline.projectionViewBindGroup);
  passEncoder.setBindGroup(1, spritePipeline.textureBindGroup);
  passEncoder.drawIndexed(6); // draw 3 vertices
};

class Rect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number
  ) {}
}

class SpritePipeline {
  public pipeline!: GPURenderPipeline;
  public textureBindGroup!: GPUBindGroup;
  public projectionViewBindGroup!: GPUBindGroup;

  public static create(
    device: GPUDevice,
    texture: Texture,
    projectionViewMatrixBuffer: GPUBuffer
  ): SpritePipeline {
    const pipeline = new SpritePipeline();
    const textureBindGroup = pipeline.initialize(
      device,
      texture,
      projectionViewMatrixBuffer
    );
    return Object.assign(pipeline, { textureBindGroup: textureBindGroup });
  }

  public initialize(
    device: GPUDevice,
    texture: Texture,
    projectionViewMatrixBuffer: GPUBuffer
  ): void {
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
          resource: texture.sampler,
        },
        {
          binding: 1,
          resource: texture.texture.createView(),
        },
      ],
    });

    this.projectionViewBindGroup = device.createBindGroup({
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

    this.pipeline = device.createRenderPipeline({
      vertex: vertexState,
      fragment: fragmentState,
      primitive: {
        topology: "triangle-list", // type of primitive to render
      },
      layout: pipelineLayout,
    });

    return textureBindGroup;
  }
}

const main = async () => {
  const { device, context, canvas } = await initializeGpu();
  const testTexture = await createTextureFromURL(device, texture);

  const playerTexture = await createTextureFromURL(device, shipTexture);
  const ufoRedTexture = await createTextureFromURL(device, ufoRedTexturex);

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

    for (let i = 0; i < 100; i++) {
      drawSprite(
        device,
        playerTexture,
        new Rect(
          Math.random() * canvas.width,
          Math.random() * canvas.height,
          100,
          100
        ),
        projectionViewMatrixBuffer,
        indexBuffer,
        passEncoder,
        camera
      );
    }
    for (let i = 0; i < 50; i++) {
      drawSprite(
        device,
        ufoRedTexture,
        new Rect(
          Math.random() * canvas.width,
          Math.random() * canvas.height,
          100,
          100
        ),
        projectionViewMatrixBuffer,
        indexBuffer,
        passEncoder,
        camera
      );
    }

    // // DRAW HERE
    // passEncoder.setPipeline(SpritePipeline.pipeline);
    // passEncoder.setIndexBuffer(indexBuffer, "uint16");
    // passEncoder.setVertexBuffer(0, verticesBuffer);
    // passEncoder.setBindGroup(0, projectionViewBindGroup);
    // passEncoder.setBindGroup(1, textureBindGroup);
    // passEncoder.drawIndexed(6); // draw 3 vertices
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
