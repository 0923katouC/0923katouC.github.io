/* SPDX-License-Identifier: GPL-3.0-only
 * Decode mass-conservative grids reconstructed from the recorded Phantom run.
 */
(() => {
  'use strict';
  async function loadGrid(grid, metadataUrl, signal) {
    if (grid.empty) return { ...grid, dimensions: [2,2,2], min:[0,0,0], max:[1,1,1], field:new Float32Array(32), heat:new Float32Array(8) };
    const url = new URL(grid.file, metadataUrl);
    url.search = metadataUrl.search;
    const response = await fetch(url, {signal, credentials:'same-origin'});
    if (!response.ok) throw new Error(`Hydro volume unavailable (${response.status})`);
    let buffer = await response.arrayBuffer();
    const signature=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength));
    if (grid.compression === 'gzip' && signature[0]===0x1f && signature[1]===0x8b) {
      if (typeof DecompressionStream !== 'function') throw new Error('Compressed hydro grids unsupported');
      buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    const size = grid.dimensions.reduce((a,b)=>a*b,1);
    if (!Number.isSafeInteger(size) || size < 1 || size > 2097152 || grid.recordStride !== 24 || buffer.byteLength !== grid.recordCount * 24) {
      throw new Error('Invalid hydro volume dimensions/records');
    }
    const field = new Float32Array(size*4), heat = new Float32Array(size);
    const view = new DataView(buffer);
    for (let offset=0; offset<buffer.byteLength; offset+=24) {
      const index=view.getUint32(offset,true);
      if (index>=size) throw new Error('Hydro voxel outside grid');
      for(let channel=0;channel<5;++channel) {
        const value=view.getFloat32(offset+4+4*channel,true);
        if(!Number.isFinite(value)) throw new Error('Non-finite hydro voxel');
        if(channel<4) field[4*index+channel]=value;
        else heat[index]=value;
      }
    }
    return {...grid,field,heat};
  }
  async function load(url) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'same-origin'});
      if(!response.ok) throw new Error('Hydro metadata unavailable');
      const metadata=await response.json();
      if(metadata.format!=='phantom-sph-sparse-volume-v1') throw new Error('Unknown hydro volume format');
      const [core,flow]=await Promise.all(['core','flow'].map(name=>loadGrid(metadata.grids[name],url,controller.signal)));
      return {metadata,core,flow};
    } finally {clearTimeout(timeout);}
  }
  window.AcademicHydroVolume=Object.freeze({load});
})();
