import shaderSource from "./shaders/shader.wgsl?raw";
import shipTexture from "./ship.png";
import ufoRedTexturex from "./ufoRed.png";
import spritesheet from "./sheet.png";
import sheetXmlText from "./sheet.xml?raw";
import uvTexture from "./uv_test.png";

import {
  Camera,
  createIndexBuffer,
  createTextureFromURL,
  createUniformBuffer,
  createVertexBuffer,
  initializeGpu,
  Rect,
} from "./utils";

const MAX_NUMBER_OF_SPRITES = 3;
const FLOAT_PER_VERTEX = 7;
const FLOATS_PER_SPRITE = 4 * FLOAT_PER_VERTEX;
const INIDICES_PER_SPRITE = 6; // 2 triangles per sprite

export class Sprite {
  constructor(
    public texture: any,
    public drawRect: Rect,
    public sourceRect: Rect
  ) {}
}

export class Content {
  public static playerTexture: Texture;
  public static ufoRedTexture: Texture;
  public static uvTexture: Texture;
  public static spriteSheet: Texture;

  public static sprites: { [id: string]: Sprite } = {};

  public static async initialize(device: GPUDevice) {
    this.playerTexture = await createTextureFromURL(device, shipTexture);
    this.ufoRedTexture = await createTextureFromURL(device, ufoRedTexturex);
    this.uvTexture = await createTextureFromURL(device, uvTexture);
    this.spriteSheet = await createTextureFromURL(device, spritesheet);

    await this.loadSpriteSheet();
  }

  private static async loadSpriteSheet() {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sheetXmlText, "text/xml");

    xmlDoc.querySelectorAll("SubTexture").forEach((subTexture) => {
      const name = subTexture.getAttribute("name")!;
      const x = parseInt(subTexture.getAttribute("x")!);
      const y = parseInt(subTexture.getAttribute("y")!);
      const width = parseInt(subTexture.getAttribute("width")!);
      const height = parseInt(subTexture.getAttribute("height")!);

      const drawRect = new Rect(0, 0, width, height);
      const sourceRect = new Rect(x, y, width, height);

      this.sprites[name] = new Sprite(this.spriteSheet, drawRect, sourceRect);
    });
  }
}

class Color {
  constructor(public r = 1, public g = 1, public b = 1) {}
}

class BatchDrawCall {
  constructor(public pipeline: SpritePipeline) {}
  public vertexData = new Float32Array(
    MAX_NUMBER_OF_SPRITES * FLOATS_PER_SPRITE
  );
  public instanceCount = 0;
}

export class SpriteRenderer {
  private defaultColor = new Color();
  private currentTexture: Texture | null = null;

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

    this.currentTexture = null;

    this.camera.update();

    this.device.queue.writeBuffer(
      this.projectionViewMatrixBuffer,
      0,
      this.camera.projectionViewMatrix as Float32Array
    );
  }

  public drawSpriteSource(
    texture: Texture,
    rect: Rect,
    sourceRect: Rect,
    color: Color = this.defaultColor
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

    let u0 = sourceRect.x / texture.texture.width;
    let v0 = sourceRect.y / texture.texture.height;
    let u1 = (sourceRect.x + sourceRect.width) / texture.texture.width;
    let v1 = (sourceRect.y + sourceRect.height) / texture.texture.height;

    // top left
    batchDrawCall.vertexData[0 + i] = rect.x;
    batchDrawCall.vertexData[1 + i] = rect.y;
    batchDrawCall.vertexData[2 + i] = u0;
    batchDrawCall.vertexData[3 + i] = v0;
    batchDrawCall.vertexData[4 + i] = color.r;
    batchDrawCall.vertexData[5 + i] = color.g;
    batchDrawCall.vertexData[6 + i] = color.b;

    // top right
    batchDrawCall.vertexData[7 + i] = rect.x + rect.width;
    batchDrawCall.vertexData[8 + i] = rect.y;
    batchDrawCall.vertexData[9 + i] = u1;
    batchDrawCall.vertexData[10 + i] = v0;
    batchDrawCall.vertexData[11 + i] = color.r;
    batchDrawCall.vertexData[12 + i] = color.g;
    batchDrawCall.vertexData[13 + i] = color.b;

    // bottom right
    batchDrawCall.vertexData[14 + i] = rect.x + rect.width;
    batchDrawCall.vertexData[15 + i] = rect.y + rect.height;
    batchDrawCall.vertexData[16 + i] = u1;
    batchDrawCall.vertexData[17 + i] = v1;
    batchDrawCall.vertexData[18 + i] = color.r;
    batchDrawCall.vertexData[19 + i] = color.g;
    batchDrawCall.vertexData[20 + i] = color.b;

    // bottom left
    batchDrawCall.vertexData[21 + i] = rect.x;
    batchDrawCall.vertexData[22 + i] = rect.y + rect.height;
    batchDrawCall.vertexData[23 + i] = u0;
    batchDrawCall.vertexData[24 + i] = v1;
    batchDrawCall.vertexData[25 + i] = color.r;
    batchDrawCall.vertexData[26 + i] = color.g;
    batchDrawCall.vertexData[27 + i] = color.b;

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

export class SpritePipeline {
  public pipeline!: GPURenderPipeline;
  public textureBindGroup!: GPUBindGroup;
  public projectionViewBindGroup!: GPUBindGroup;

  public static create(
    device: GPUDevice,
    texture: Texture,
    projectionViewMatrixBuffer: GPUBuffer
  ): SpritePipeline {
    const pipeline = new SpritePipeline();
    pipeline.initialize(device, texture, projectionViewMatrixBuffer);
    return pipeline;
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
              srcFactor: "src-alpha",
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

  await Content.initialize(device);

  const spriteRenderer = new SpriteRenderer(
    device,
    canvas.width,
    canvas.height
  );
  spriteRenderer.initialize();

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

    spriteRenderer.framePass(passEncoder);

    const playerSprite = Content.sprites["playerShip1_blue.png"];

    playerSprite.drawRect.x += 0.7;
    playerSprite.drawRect.y += 0.7;

    spriteRenderer.drawSpriteSource(
      playerSprite.texture,
      playerSprite.drawRect,
      playerSprite.sourceRect
    );

    const shield = Content.sprites["shield1.png"];
    shield.drawRect.x = playerSprite.drawRect.x - 13;
    shield.drawRect.y = playerSprite.drawRect.y - 12;

    spriteRenderer.drawSpriteSource(
      shield.texture,
      shield.drawRect,
      shield.sourceRect,
      new Color(0, 0, 1)
    );

    const drawRect = new Rect(0, 0, 200, 200);

    const halfWidth = Content.uvTexture.width / 2;
    const halfHeight = Content.uvTexture.height / 2;
    const sourceRect = new Rect(0, halfHeight, halfWidth, halfHeight);

    spriteRenderer.drawSpriteSource(Content.uvTexture, drawRect, sourceRect);

    spriteRenderer.frameEnd();

    // END DRAW HERE
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
