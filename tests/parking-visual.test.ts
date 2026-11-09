import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getParkingItems,parkingCounts,parkingSizeClass,parkingMetersPerUnit} from '../src/lib/parking';
import {parkingScale} from '../src/lib/parking-scale';
test('ported inventory counters: ten spaces on -1; parking/storage separate on -2',()=>{
 assert.deepEqual(parkingCounts(-1),[{type:'parking',total:10,available:10}]);
 assert.deepEqual(parkingCounts(-2),[{type:'parking',total:12,available:10},{type:'storeroom',total:10,available:10}]);
});
test('original getSizeLabel ranges; storage has no invented class',()=>{
 const expected:Record<string,string>={P13:'XL',P14:'L',P15:'L',P16:'L',P17:'M',P18:'M',P19:'M',P20:'M',P21:'S',P22:'M',P1:'XL',P2:'L',P3:'L',P4:'L',P5:'L',P6:'S',P7:'S',P8:'S',P9:'S',P10:'S',P11:'S',P12:'S'};
 for(const item of getParkingItems())assert.equal(parkingSizeClass(item.areaM2),expected[item.id]??null,item.id);
 for(const area of [12,14.6,15.5,18.6,21.4,24.95])assert.equal(parkingSizeClass(area),null);
});
test('original P2 scale calibration, nice steps, hysteresis, and zoom dimensions',()=>{
 assert.equal(parkingMetersPerUnit,Math.sqrt(23.25/(48.24*130.44)));
 const a=parkingScale(1,0,parkingMetersPerUnit);
 assert.equal(a.meters,5);
 const b=parkingScale(1.1,a.meters,parkingMetersPerUnit);
 assert.equal(b.meters,5);
 assert.ok(Math.abs(b.pixels/a.pixels-1.1)<.03);
 const c=parkingScale(4,0,parkingMetersPerUnit);
 assert.equal(c.meters,1);
});
test('source palette and marker contrast boundaries retain original fills',()=>{
 const css=readFileSync(new URL('../src/styles/tokens.css',import.meta.url),'utf8');
 for(const hex of ['#10af35','#f59e0b','#dc2626','#0a7a25','#92400e','#7f1d1d'])assert.ok(css.includes(hex));
 const luminance=(hex:string)=>{const c=hex.match(/[a-f\d]{2}/gi)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]!*.2126+c[1]!*.7152+c[2]!*.0722;};
 for(const color of ['0a7a25','92400e','7f1d1d','444444','555555'])assert.ok(1.05/(luminance(color)+.05)>=4.5,color);
});
