const fs = require('fs');
const { spawn } = require('child_process');
const rimrafcb = require('rimraf');
const rimraf = (f, opts) => new Promise((res, rej) => rimrafcb(f, opts, err => { if(err) rej(err); else res();})); 


/**
 * spawn swagger-codegen to generate an API from a model
 * @param {string} modelPath path to the swagger-codegen model
 * @param {string} outPath path where the generated apis will be placed
 * @param {string} language the language that the apis will be generated in
 */
async function generate(modelPath, outPath, language) {
    console.log(`generating ${outPath} from ${modelPath}`);
    const cmd = `swagger-codegen generate -l ${language} -i ${modelPath} -o ${outPath} --model-name-prefixapi`;
    return new Promise((res, rej) => {
        const genProc = spawn('swagger-codegen', ['generate', '-l', language, '-i', modelPath, '-o', outPath]);

        genProc.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        genProc.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        genProc.on('close', (code) => {
            if(code !== 0) {
                console.log(`swagger-codegen exited with code ${code}`);
            }
            res(code.toString());
        });

    });
}

/**
 * generate apis for a directory where each subdirectory contains a model file
 * @param {string} modelsPath the path to a directory containing model subdirectories
 * @param {string} outPath the path where the apis will be generated
 * @param {string} modelsPath the path to a directory containing model subdirectories
 */
async function generateAll(modelsPath, outPath, language) {
    const dir = await fs.promises.opendir(modelsPath);
    for await (const dirent of dir) {
        if(dirent.isDirectory) {
            const subDir = await fs.promises.opendir(`${modelsPath}${dirent.name}`);
            for await (const subdirent of subDir) {
                if(subdirent.isFile()) {
                    await generate(`${modelsPath}${dirent.name}/${subdirent.name}`, `${outPath}${dirent.name}`, language);
                }
            }
        }  
    }  
}

async function gen(modelsPath, outPath, language) {
  console.log(`removing directory ${outPath}`);
  await rimraf(outPath, {});
  console.log(`creating directory ${outPath}`);
  //await mkdirp(outPath, {});
  await fs.promises.mkdir(outPath);
  console.log(`generating apis for ${language} in ${outPath} from ${modelsPath}`);
  await generateAll(modelsPath, outPath, language);
}

const modelsPath = './selling-partner-api-models/models/'
const language = 'typescript-axios';
const outPath = `./gen/`

gen(modelsPath, outPath, language)
.then(
  () => {
    console.log('generate done success.');
    process.exit(0);
  }, 
  err => {
    console.error(`generate fail.\n${err.message}\n${err.stack}`);
    process.exit(1);
  }
);
