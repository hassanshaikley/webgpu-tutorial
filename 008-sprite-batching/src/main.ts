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
  Rect,
} from "./utils";

const MAX_NUMBER_OF_SPRITES = 1000;
const FLOAT_PER_VERTEX = 7;
const FLOATS_PER_SPRITE = 4 * FLOAT_PER_VERTEX;
const INIDICES_PER_SPRITE = 6; // 2 triangles per sprite

const vertexData: Float32Array = new Float32Array(7 * 4);

const drawSprite = (
  device: GPUDevice,
  texture: any,
  rect: Rect,
  projectionViewMatrixBuffer: GPUBuffer,
  indexBuffer: GPUBuffer,
  passEncoder: GPURenderPassEncoder,
  camera: Camera
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

class BatchDrawCall {
  constructor(public pipeline: SpritePipeline) {}
  public vertexData = new Float32Array(
    MAX_NUMBER_OF_SPRITES * FLOATS_PER_SPRITE
  );
  public instanceCount = 0;
}

class SpriteRenderer {
  private currentTexture!: Texture;

  private indexBuffer!: GPUBuffer;
  private projectionViewMatrixBuffer!: GPUBuffer;

  private camera: Camera;

  private passEncoder!: GPURenderPassEncoder;

  /**
   * Pipelines created for each texture
   */
  private pipelinesPerTexture: { [id: string]: SpritePipeline } = {};

  /**
   * The draw calls per texture.
   */
  private batchDrawCallPerTexture: { [id: string]: Array<BatchDrawCall> } = {};

  /**
   * The buffers which are currently allocated and used for vertex data.
   */
  private allocatedVertexBuffers: Array<GPUBuffer> = [];

  constructor(
    private device: GPUDevice,
    private width: number,
    private height: number
  ) {
    this.camera = new Camera(this.width, this.height);
  }

  private setupIndexBuffer() {
    const data = new Uint16Array(MAX_NUMBER_OF_SPRITES * INIDICES_PER_SPRITE);

    for (let i = 0; i < MAX_NUMBER_OF_SPRITES; i++) {
      // t1
      data[i * INIDICES_PER_SPRITE + 0] = i * 4 + 0;
      data[i * INIDICES_PER_SPRITE + 1] = i * 4 + 1;
      data[i * INIDICES_PER_SPRITE + 2] = i * 4 + 2;

      // t2
      data[i * INIDICES_PER_SPRITE + 3] = i * 4 + 2;
      data[i * INIDICES_PER_SPRITE + 4] = i * 4 + 3;
      data[i * INIDICES_PER_SPRITE + 5] = i * 4 + 0;
    }

    this.indexBuffer = createIndexBuffer(this.device, data);
  }

  public initialize() {
    this.projectionViewMatrixBuffer = createUniformBuffer(
      this.device,
      new Float32Array(16)
    );
    this.setupIndexBuffer();
  }

  public framePass(passEncoder: GPURenderPassEncoder) {
    this.passEncoder = passEncoder;

    this.batchDrawCallPerTexture = {};

    this.camera.update();

    this.device.queue.writeBuffer(
      this.projectionViewMatrixBuffer,
      0,
      this.camera.projectionViewMatrix as Float32Array
    );
  }

  // public drawSprite(texture: Texture, rect: Rect) {

  public drawSprite(
    device: GPUDevice,
    texture: any,
    rect: Rect,
    projectionViewMatrixBuffer: GPUBuffer,
    indexBuffer: GPUBuffer,
    passEncoder: GPURenderPassEncoder,
    camera: Camera
  ) {
    if (this.currentTexture != texture) {
      this.currentTexture = texture;

      let pipeline = this.pipelinesPerTexture[texture.id];
      if (!pipeline) {
        pipeline = SpritePipeline.create(
          this.device,
          texture,
          this.projectionViewMatrixBuffer
        );
        this.pipelinesPerTexture[texture.id] = pipeline;
      }

      let batchDrawCalls = this.batchDrawCallPerTexture[texture.id];
      if (!batchDrawCalls) {
        this.batchDrawCallPerTexture[texture.id] = [];
      }
    }

    const arrayOfBatchCalls = this.batchDrawCallPerTexture[texture.id];
    let batchDrawCall = arrayOfBatchCalls[arrayOfBatchCalls.length - 1];
    if (!batchDrawCall) {
      batchDrawCall = new BatchDrawCall(this.pipelinesPerTexture[texture.id]);
      this.batchDrawCallPerTexture[texture.id].push(batchDrawCall);
    }

    let i = batchDrawCall.instanceCount * FLOATS_PER_SPRITE;

    // top left
    batchDrawCall.vertexData[0 + i] = rect.x;
    batchDrawCall.vertexData[1 + i] = rect.y;
    batchDrawCall.vertexData[2 + i] = 0.0;
    batchDrawCall.vertexData[3 + i] = 0.0;
    batchDrawCall.vertexData[4 + i] = 1.0;
    batchDrawCall.vertexData[5 + i] = 1.0;
    batchDrawCall.vertexData[6 + i] = 1.0;

    // top right
    batchDrawCall.vertexData[7 + i] = rect.x + rect.width;
    batchDrawCall.vertexData[8 + i] = rect.y;
    batchDrawCall.vertexData[9 + i] = 1.0;
    batchDrawCall.vertexData[10 + i] = 0.0;
    batchDrawCall.vertexData[11 + i] = 1.0;
    batchDrawCall.vertexData[12 + i] = 1.0;
    batchDrawCall.vertexData[13 + i] = 1.0;

    // bottom right
    batchDrawCall.vertexData[14 + i] = rect.x + rect.width;
    batchDrawCall.vertexData[15 + i] = rect.y + rect.height;
    batchDrawCall.vertexData[16 + i] = 1.0;
    batchDrawCall.vertexData[17 + i] = 1.0;
    batchDrawCall.vertexData[18 + i] = 1.0;
    batchDrawCall.vertexData[19 + i] = 1.0;
    batchDrawCall.vertexData[20 + i] = 1.0;

    // bottom left
    batchDrawCall.vertexData[21 + i] = rect.x;
    batchDrawCall.vertexData[22 + i] = rect.y + rect.height;
    batchDrawCall.vertexData[23 + i] = 0.0;
    batchDrawCall.vertexData[24 + i] = 1.0;
    batchDrawCall.vertexData[25 + i] = 1.0;
    batchDrawCall.vertexData[26 + i] = 1.0;
    batchDrawCall.vertexData[27 + i] = 1.0;

    batchDrawCall.instanceCount++;

    if (batchDrawCall.instanceCount >= MAX_NUMBER_OF_SPRITES) {
      const newBatchDrawCall = new BatchDrawCall(
        this.pipelinesPerTexture[texture.id]
      );
      this.batchDrawCallPerTexture[texture.id].push(newBatchDrawCall);
    }
  }

  public frameEnd() {
    let usedVertexBuffers = [];

    for (const key in this.batchDrawCallPerTexture) {
      const arrayOfBatchDrawCalls = this.batchDrawCallPerTexture[key];

      for (const batchDrawCall of arrayOfBatchDrawCalls) {
        if (batchDrawCall.instanceCount == 0) continue;

        let vertexBuffer = this.allocatedVertexBuffers.pop();
        if (!vertexBuffer) {
          vertexBuffer = createVertexBuffer(
            this.device,
            batchDrawCall.vertexData
          );
        } else {
          this.device.queue.writeBuffer(
            vertexBuffer,
            0,
            batchDrawCall.vertexData
          );
        }

        usedVertexBuffers.push(vertexBuffer);
        const spritePipeline = batchDrawCall.pipeline;

        // DRAW HERE
        this.passEncoder.setPipeline(spritePipeline.pipeline);
        this.passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
        this.passEncoder.setVertexBuffer(0, vertexBuffer);
        this.passEncoder.setBindGroup(
          0,
          spritePipeline.projectionViewBindGroup
        );
        this.passEncoder.setBindGroup(1, spritePipeline.textureBindGroup);
        this.passEncoder.drawIndexed(6 * batchDrawCall.instanceCount); // draw 3 vertices
      }
    }

    for (let vertexBuffer of usedVertexBuffers) {
      this.allocatedVertexBuffers.push(vertexBuffer);
    }
  }
}

class SpritePipeline {
  public pipeline!: GPURenderPipeline;
  public textureBindGroup!: GPUBindGroup;
  public projectionViewBindGroup!: GPUBindGroup;

  public static create(
    device: GPUDevice,
    texture: any,
    projectionViewMatrixBuffer: GPUBuffer
  ): SpritePipeline {
    const pipeline = new SpritePipeline();
    pipeline.initialize(device, texture, projectionViewMatrixBuffer);
    return pipeline;
  }

  public initialize(
    device: GPUDevice,
    texture: any,
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

    this.textureBindGroup = device.createBindGroup({
      label: texture.id,
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
  }
}

const main = async () => {
  const { device, context, canvas } = await initializeGpu();

  const spriteRenderer = new SpriteRenderer(
    device,
    canvas.width,
    canvas.height
  );
  spriteRenderer.initialize();

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
    spriteRenderer.framePass(passEncoder);

    for (let i = 0; i < 600; i++) {
      spriteRenderer.drawSprite(
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
    for (let i = 0; i < 2; i++) {
      spriteRenderer.drawSprite(
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

    spriteRenderer.frameEnd();

    // END DRAW HERE
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
