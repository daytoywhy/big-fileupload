<template>
  <div>
    <input type="file" @change="handleFileChange">
  </div>
</template>
<script setup lang="ts">
import SparkMD5 from "spark-md5"
import {ref} from "vue"
const CHUNKS_SIZE = 1024 * 1024 * 1
const fileHash = ref<string>('')
const filename = ref<string>('')
//计算文件hash
const calculateHash = (chunks: Blob[]) => {
  return new Promise((resolve) => {
    // 第一个和最后一个切片全都参与计算
    // 中间的切片只计算前面两个字节、中间两个字节和后面两个字节
    const targets: Blob[] = [] // 储存需要计算的切片
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    chunks.forEach((chunk, index) => {
      if (index === 0 || index === chunks.length - 1) {
        targets.push(chunk)
      } else {
        targets.push(chunk.slice(0, 2))
        targets.push(chunk.slice(CHUNKS_SIZE / 2, CHUNKS_SIZE / 2 + 2))
        targets.push(chunk.slice(CHUNKS_SIZE - 2, CHUNKS_SIZE))

      }
    })
    fileReader.readAsArrayBuffer(new Blob(targets))
    fileReader.onload = (e) => {
      spark.append((e.target as FileReader).result)
      resolve(spark.end())
    }
  })

}
//分片
const createChunks = (file: File) => {
  let cur = 0
  let chunks = []
  while (cur < file.size) {
    chunks.push(file.slice(cur, cur + CHUNKS_SIZE))
    cur += CHUNKS_SIZE
  }
  return chunks
}
//上传切片
const uploadChunks = async(chunks:Blob[],existChunks:string[]) => {
  const data = chunks.map((chunk,index)=>{
    return {
      fileHash: fileHash.value,
      chunkHash: fileHash.value + '-' + index,
      chunk
    }
  })
  const formDatas = data
  .filter((item) => !existChunks.includes(item.chunkHash))
  .map(item => {
    const formData = new FormData()
    formData.append('chunk', item.chunk)
    formData.append('chunkHash', item.chunkHash)
    formData.append('fileHash', item.fileHash)
    return formData
  })
  const max = 6 //最大并发数
  let index = 0
  const taskPool:any = []
  while(index < formDatas.length){
     const task = fetch('http://localhost:3001/upload',{
       method: 'POST',
       body: formDatas[index]
     })
     taskPool.splice(taskPool.findIndex((item:any) => item === task),1)
     taskPool.push(task)
     if(taskPool.length === max){
      await Promise.race(taskPool)
     }
     index++
  }
 await Promise.all(taskPool)
  mergeRequest()

  //通知服务器合并文件
}
//通知服务器合并文件
const mergeRequest = () => {
  fetch('http://localhost:3001/merge',{
    method: 'POST',
    headers:{
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fileHash: fileHash.value,
      filename: filename.value,
      size: CHUNKS_SIZE
    })
  }).then(res => {
      alert('合并成功了');
    })
}

// 上传前检验文件是否已经上传
const verify = ()=>{
 return fetch('http://localhost:3001/verify',{
    method: 'POST',
    headers:{
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fileHash: fileHash.value,
      filename: filename.value,
    })

  }).then(res=> res.json())
  .then(res => {
    return res
  })
}
const handleFileChange = async(e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files) return

  const file = files[0]
  filename.value = file.name
  const chunks = createChunks(file)
  const hash = await calculateHash(chunks)
  fileHash.value = hash as string


//   // 验证文件是否已经上传
 const data = await verify()
 
 if(!data.data.shouldUpload){
  alert('秒传，上传成功')
  return
 } 
  //上传
  uploadChunks(chunks,data.data.existChunks)

 
  

}
</script>
<style scoped></style>
