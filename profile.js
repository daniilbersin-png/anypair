import {englishError} from './lib/language.mjs';
import {normalizeProfile,MAX_AVATAR_BYTES} from './lib/profile.mjs';
export function initProfile({changed}){
 const $=s=>document.querySelector(s);let avatar='',processing=false,imageError='',version=0;
 function preview(){const image=$('#f-avatar-preview');image.hidden=!avatar;if(avatar)image.src=avatar;else image.removeAttribute('src');$('#f-avatar-remove').hidden=!avatar;$('#f-avatar-name').textContent=avatar?'Image selected':'No image selected';}
 $('#f-avatar-choose').onclick=()=>$('#f-avatar').click();
 $('#f-avatar').onchange=async()=>{
  const current=++version,file=$('#f-avatar').files[0];avatar='';imageError='';processing=false;preview();changed();if(!file)return;
  processing=true;$('#f-avatar-status').textContent='Preparing avatar…';let bitmap;
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a PNG, JPEG or WebP image, up to 5 MB.');
   bitmap=await createImageBitmap(file);if(!bitmap.width||!bitmap.height)throw Error('Cannot read this image.');
   const canvas=document.createElement('canvas'),side=Math.min(bitmap.width,bitmap.height);
   let result='';
   for(const size of [128,96,64]){canvas.width=canvas.height=size;canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);for(const quality of [.85,.65,.45,.25]){const data=canvas.toDataURL('image/webp',quality);if(data.startsWith('data:image/webp;')&&atob(data.split(',')[1]).length<=MAX_AVATAR_BYTES){result=data;break;}}if(result)break;}
   if(!result)throw Error('This image is too detailed. Choose a simpler avatar.');
   if(current!==version)return;avatar=result;preview();$('#f-avatar-status').textContent='Avatar ready. A square preview is saved with your token.';
  }catch(e){if(current===version){$('#f-avatar').value='';imageError=englishError(e,'This image could not be processed. Choose another PNG, JPEG or WebP image.');$('#f-avatar-remove').hidden=false;$('#f-avatar-status').textContent=imageError;}}
  finally{bitmap?.close();if(current===version){processing=false;changed();}}
 };
 $('#f-avatar-remove').onclick=()=>{version++;processing=false;imageError='';avatar='';$('#f-avatar').value='';$('#f-avatar-status').textContent='';preview();changed();};
 for(const id of ['#f-description','#f-x'])$(id).oninput=changed;
 return {read(){if(imageError)throw Error(imageError+' Remove the avatar or choose another image.');if(processing)throw Error('Wait for the avatar to finish processing.');return normalizeProfile({avatar,description:$('#f-description').value,x:$('#f-x').value});},reset(){version++;processing=false;imageError='';avatar='';$('#f-avatar').value=$('#f-description').value=$('#f-x').value='';$('#f-avatar-status').textContent='';preview();}};
}
