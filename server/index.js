const express = require('express');
const path = require('path');
const multipart = require('multiparty');
const fse = require('fs-extra');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json())
app.use(cors());

//提取文件后缀名
const extractExt = (filename)=>{
  return filename.slice(filename.lastIndexOf('.'), filename.length)
}

const UPLOAD_DIR = path.resolve(__dirname, 'uploads');

app.post('/upload', (req, res) => {
    const form = new multipart.Form();
    form.parse(req, async(err, fields, files) => {
      if(err){
        res.status(401).json({
          msg:'上传失败,请重新上传',
          ok:false
        })
        return 
      }
     try {
       //临时存放目录
       const fileHash = fields['fileHash'][0]
       const chunkHash = fields['chunkHash'][0]
       const chunkPath = path.resolve(UPLOAD_DIR, fileHash)
       if(!fse.existsSync(chunkPath)){
        await fse.mkdir(chunkPath)
       }
       //将切片放到临时目录
       const oldPath = files['chunk'][0]['path']
       await fse.move(oldPath, path.resolve(chunkPath, chunkHash))
       res.status(200).json({
         ok:true,
         msg:'上传成功',
       })
     } catch (error) {
      console.log(error,'错误');
     }
    })
})

app.post('/merge',async (req, res) => {
  const {fileHash, size, filename} = req.body
  const filePath = path.resolve(UPLOAD_DIR, fileHash + extractExt(filename))
  if(fse.existsSync(filePath)){
    res.status(200).json({
      ok:true,
      msg:'合并成功'
    })
    return
  }

  //如果不存在就进行合并
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
  if(!fse.existsSync(chunkDir)){
    res.status(401).json({
      ok:false,
      msg:'合并失败，请重新上传'
    })
    return
  } 
  const chunkPaths = await fse.readdir(chunkDir)
  chunkPaths.sort((a,b)=>{
    return a.split('-')[1] - b.split('-')[1]
  })
 const list = chunkPaths.map((chunkName,index)=>{
    return new Promise((resolve,reject)=>{
      const chunkPath = path.resolve(chunkDir, chunkName)
      const readStream = fse.createReadStream(chunkPath)
      const writeStream = fse.createWriteStream(filePath, {
        start: index * size,
        end: (index + 1) * size
      })
      readStream.on('end',async()=>{
        await fse.unlink(chunkPath)
        resolve()
      })
      readStream.pipe(writeStream)
    })

  })
  await Promise.all(list)
 await fse.remove(chunkDir)
  res.status(200).json({
    ok:true,
    msg:'合并成功'
  })
})

app.post('/verify',async (req, res) => {
  const {fileHash,filename} = req.body
  const filePath = path.resolve(UPLOAD_DIR, fileHash + extractExt(filename))

  //返回服务上已经上传的切片
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
  let chunkPaths = []
  if(fse.existsSync(chunkDir)){
    chunkPaths = await fse.readdir(chunkDir)
  }

  if(fse.existsSync(filePath)){
    //不用上传
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:false
      }
    })
  } else{
    //要上传
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:true,
        existChunks: chunkPaths
      }
    })
  }
})

app.listen(3001, () => console.log('Server started on port 3001'));