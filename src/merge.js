// convert Error to ModelError
// search 

const fs = require('fs');

// types ignored for import
const simpleTypes = ['string', 'number', 'boolean'];

/**
 * process a directory of api models to force specific type references and 
 * extract imports and exports
 * @param {string} path path to models directory
 */
async function typeFix(path) {
    const data = fs.readFileSync(path).toString();
    const lines = data.split('\n');
    let exports = [];
    let imports = [];
    
    let type, importType, skip = 0;
    let replaceCount = 0;
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // export interface ItemList extends Array<Item> {
        if(line.startsWith('export ')) {
            let exportLine = line.split(' ');
            let expType = exportLine[2];
            if(expType) {
                if(exportLine.length >= 5 && exportLine[3] === 'extends') {
                    let dependency = exportLine[4];
                    dependency = dependency.split('<');
                    if(dependency.length > 1) {
                        dependency = dependency[1].split('>')[0];
                    } else {
                        dependency = dependency[0];
                    }
                    // if(dependency === 'Error') {
                    //     dependency = 'ModelError';

                    // }
                    imports.push(dependency);
                }
                //console.log(`${path} lineNum: ${lineNum+1} found export: ${expType}`);
                exports.push(expType);
            }
        }
        let i = line.indexOf('* @type {');
        if(i>=0) {
            if(type) {
                //console.log(`${path} lineNum: ${lineNum+1} - new type found before using old type`);
            }
            let t0 = line.split('{')[1];
            let t1 = t0.split('}')[0]
            let t2 = t1.replace(/&gt;/g, '>').replace(/&lt;/g, '<');
            let t3 = t2.split('<');
            if(t3.length > 1) {
                if(t3[0] !== 'Array') {
                    throw new Error(`${path}:${lineNum+1} non-Array container`);
                }
                importType = t3[1].split('>')[0];
                type = `[${importType}]`;
                //console.log(`type: ${type}, t3: ${t3}, line: ${line}`);
            } else {
                type = t3[0];
                importType = type;
            }
            //console.log(`${path} lineNum: ${lineNum+1} - type: ${type}`);
            skip = 4;
        }
        //console.log(`type: ${type}, skip: ${skip}`);
        if(type && skip && --skip <= 0) {
            //console.log(`***************`);
            i = line.indexOf(': any;');
            if(i >= 0) {
                if(type === 'Error') {
                    type = 'ModelError';
                }
                lines[lineNum] = line.replace(/: any;/g, `: ${type};`);
                //console.log(`${path} lineNum: ${lineNum+1} = ${lines[lineNum]}`);
                imports.push(importType);
                type = undefined;
                skip = 0;
                replaceCount++;
            }
        }
    }

    //console.log(`##imports: ${JSON.stringify(imports)}`);
    // filter imports and exports for duplicates and simple types
    exports = exports.filter((e, i, a) => simpleTypes.indexOf(e) < 0 && a.indexOf(e) === i);
    imports = imports.filter((e, i, a) => simpleTypes.indexOf(e) < 0 && a.indexOf(e) === i);
    return { lines, exports, imports };
}

/**
 * typeFix and resolve dependencies in all the models ain all the generated apis
 * @param {string} genPath 
 */
async function typeFixAll(genPath) {
    const dir = await fs.promises.opendir(genPath);
    for await (const dirent of dir) {
        // map of input file name to typeFix output. { lines, exports, imports }
        const files = {};
        // typeFix the model files in each genereated api
        if(dirent.isDirectory()) {
            const modelsDir = await fs.promises.opendir(`${genPath}${dirent.name}/models/`);
            console.log(`typeFixAll processing models directory: ${modelsDir}`);
            for await (const modelDirEnt of modelsDir) {
                if(modelDirEnt.isFile() && modelDirEnt.name !== 'index.ts') {
                    const fn = `${genPath}${dirent.name}/models/${modelDirEnt.name}`;
                    files[fn] = await typeFix(fn)
                }
            }
        }

        // resolve add imports to the files and write them back out
        for(let fn in files) {
            let { lines, imports } = files[fn];
            console.log(`resolving fn: ${fn}, imports: ${JSON.stringify(imports)}`);
            for(let sfn in files) {
                let { exports } = files[sfn];
                let matches = exports.filter(e => imports.indexOf(e) >= 0);
                if(matches.length > 0) {
                    let segs = sfn.split('/');
                    segs = segs[segs.length-1].split('.');
                    let inc = segs.slice(0, segs.length-1).join('.');
                    lines.unshift(`import {${matches.join(',')}} from './${inc}';`);
                    imports = imports.filter(e => matches.indexOf(e) < 0);
                } 
            }
            fs.writeFileSync(fn, lines.join('\n'));
        }
    }
}

/**
 * create an index.ts that combines each of the generated apis
 * @param {string} genPath 
 */
async function writeIndex(genPath) {
    const dir = await fs.promises.opendir(genPath);
    const lines = [];
    for await (const dirent of dir) {
        if(dirent.isDirectory()) {
            lines.push(`export * from './${dirent.name}';`);
        }
    }
    await fs.promises.writeFile(`${genPath}index.ts`, lines.join('\r\n'));
}


async function merge(genPath) {
    await typeFixAll(genPath);
    await writeIndex(genPath);
}


merge('./gen/').then(()=> console.log('merge done success.'), err => console.error(`merge done error.\n${err.message}\n${err.stack}`));
