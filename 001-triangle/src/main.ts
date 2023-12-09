import shaderSource from "./shaders/shader.wgsl?raw";

const main = async () => {
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

  const shaderModule = device.createShaderModule({
    code: shaderSource,
  });

  const vertexState: GPUVertexState = {
    module: shaderModule,
    entryPoint: "vertexMain", // name of the entry point function for vertex shader, must be same as in shader
    buffers: [],
  };

  const fragmentState: GPUFragmentState = {
    module: shaderModule,
    entryPoint: "fragmentMain", // name of the entry point function for fragment/pixel shader, must be same as in shader
    targets: [
      {
        format: navigator.gpu.getPreferredCanvasFormat(),
      },
    ],
  };

  const pipeline = device.createRenderPipeline({
    vertex: vertexState,
    fragment: fragmentState,
    primitive: {
      topology: "triangle-list", // type of primitive to render
    },
    layout: "auto",
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
    passEncoder.draw(3); // draw 3 vertices
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    window.requestAnimationFrame(() => draw());
  };

  draw();
};

main();
