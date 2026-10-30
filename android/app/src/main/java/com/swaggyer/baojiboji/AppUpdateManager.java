package com.swaggyer.baojiboji;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Explicit user-controlled updates from this repository's signed release APK. */
public final class AppUpdateManager {
    public interface Listener { void onMessage(JSONObject message); }
    private static final String REPO="swaggyer/Build-up-muscles";
    private static final String API="https://api.github.com/repos/"+REPO+"/releases/latest";
    private static final String PAGE="https://github.com/"+REPO+"/releases/latest";
    private static final long MAX_APK=1024L*1024*1024;
    private final Activity activity;
    private final Listener listener;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private volatile boolean closed;
    private JSONObject latest;
    private File verifiedFile;
    private String verifiedSha;
    public AppUpdateManager(Activity activity,Listener listener){this.activity=activity;this.listener=listener;}

    public void handle(String id,String action,JSONObject request){
        if(closed||id==null||id.isEmpty()||id.length()>100)return;
        executor.execute(()->{
            try{
                switch(action){
                    case "check":check(id,action);break;
                    case "download":download(id,action);break;
                    case "openInstall":openInstall(id,action);break;
                    case "settings":openSettings(id,action);break;
                    default:throw new UpdateFailure("unsupported-action","暂不支持此更新操作。");
                }
            }catch(UpdateFailure error){send(id,action,"error",false,json("code",error.code,"message",error.getMessage()));}
            catch(Exception error){send(id,action,"error",false,json("code","network-error","message","暂时无法完成更新，请检查网络后重试，或前往版本发布页。"));}
        });
    }
    private PackageInfo installed() throws Exception{return activity.getPackageManager().getPackageInfo(activity.getPackageName(),signatureFlags());}
    private static int signatureFlags(){return Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;}
    private static long versionCode(PackageInfo info){return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;}
    private JSONObject current() throws Exception{PackageInfo info=installed();return json("versionName",info.versionName,"versionCode",versionCode(info));}
    private void check(String id,String action) throws Exception{
        JSONObject release=new JSONObject(readText(API,2*1024*1024));
        if(release.optBoolean("draft")||release.optBoolean("prerelease"))throw new UpdateFailure("no-release","暂无可用的正式更新。");
        String tag=release.optString("tag_name");Matcher match=Pattern.compile("^android-v(\\d+\\.\\d+\\.(\\d+))$").matcher(tag);
        if(!match.matches())throw new UpdateFailure("invalid-release","版本信息格式有误，请稍后重试。");
        long code=Long.parseLong(match.group(2));
        JSONArray assets=release.optJSONArray("assets");JSONObject apk=null,checksum=null;
        if(assets!=null)for(int i=0;i<assets.length();i++){
            JSONObject asset=assets.getJSONObject(i);
            if("baoji-boji-android.apk".equals(asset.optString("name")))apk=asset;
            if("baoji-boji-android.apk.sha256".equals(asset.optString("name")))checksum=asset;
        }
        if(apk==null)throw new UpdateFailure("no-apk","此版本尚未发布安装包，请稍后重试。");
        String url=apk.optString("browser_download_url");requireReleaseUrl(url);
        long size=apk.optLong("size");if(size<1024||size>MAX_APK)throw new UpdateFailure("invalid-apk","安装包信息异常，已停止更新。");
        String sha=apk.optString("digest").replaceFirst("^sha256:","").toLowerCase(java.util.Locale.ROOT);
        if(!sha.matches("[a-f0-9]{64}")&&checksum!=null){String checksumUrl=checksum.optString("browser_download_url");requireReleaseUrl(checksumUrl);sha=readText(checksumUrl,4096).trim().split("\\s+")[0].toLowerCase(java.util.Locale.ROOT);}
        if(!sha.matches("[a-f0-9]{64}"))throw new UpdateFailure("missing-checksum","此版本缺少安装包校验信息，暂不能在应用内安装。");
        String notes=release.optString("body","");if(notes.length()>100000)notes=notes.substring(0,100000);
        latest=json("version",match.group(1),"versionCode",code,"tag",tag,"title",release.optString("name",tag),"notes",notes,"publishedAt",release.optString("published_at"),"releasePageUrl",PAGE,"downloadUrl",url,"size",size,"sha256",sha);
        send(id,action,"result",true,json("current",current(),"release",latest,"available",code>versionCode(installed())));
    }
    private void download(String id,String action) throws Exception{
        if(latest==null)throw new UpdateFailure("check-first","请先检查更新，再下载新版本。");
        if(latest.getLong("versionCode")<=versionCode(installed()))throw new UpdateFailure("up-to-date","当前已是最新版本。");
        File folder=new File(activity.getCacheDir(),"app-updates");if(!folder.exists()&&!folder.mkdirs())throw new UpdateFailure("storage-error","无法创建更新文件，请检查手机存储空间。");
        File partial=new File(folder,"update.apk.part"),ready=new File(folder,"update.apk");
        String sha=latest.getString("sha256");long expected=latest.getLong("size");
        if(folder.getUsableSpace()<expected+32L*1024*1024)throw new UpdateFailure("storage-full","手机可用空间不足，请释放空间后重试。");
        HttpURLConnection connection=open(latest.getString("downloadUrl"));
        try(InputStream input=connection.getInputStream();FileOutputStream output=new FileOutputStream(partial)){
            MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=new byte[128*1024];long count=0,last=0;int read;
            while((read=input.read(bytes))!=-1){
                if(closed||Thread.currentThread().isInterrupted())throw new UpdateFailure("cancelled","下载已停止。");
                count+=read;if(count>expected||count>MAX_APK)throw new UpdateFailure("size-mismatch","安装包大小不符，已停止下载。");
                output.write(bytes,0,read);digest.update(bytes,0,read);
                long now=System.currentTimeMillis();if(now-last>400){send(id,action,"progress",true,json("progress",Math.min(99,count*100.0/expected),"downloaded",count,"total",expected));last=now;}
            }
            output.getFD().sync();if(count!=expected||!hex(digest.digest()).equals(sha))throw new UpdateFailure("checksum-mismatch","安装包校验失败，请重新下载。");
        }catch(Exception error){partial.delete();throw error;}finally{connection.disconnect();}
        try{verifyPackage(partial,latest.getLong("versionCode"));}catch(Exception error){partial.delete();throw error;}
        if(ready.exists()&&!ready.delete())throw new UpdateFailure("storage-error","无法准备新安装包，请重试。");
        if(!partial.renameTo(ready))throw new UpdateFailure("storage-error","无法保存安装包，请重试。");
        verifiedFile=ready;verifiedSha=sha;boolean permission=activity.getPackageManager().canRequestPackageInstalls();
        send(id,action,"result",true,json("state","downloaded","canInstall",permission,"requiresPermission",!permission));
    }
    private void openInstall(String id,String action) throws Exception{
        if(verifiedFile==null||!verifiedFile.isFile()||latest==null)throw new UpdateFailure("download-first","请先下载并校验新版本。");
        if(!verifiedSha.equals(fileSha(verifiedFile)))throw new UpdateFailure("checksum-mismatch","安装包已变化，请重新下载。");
        verifyPackage(verifiedFile,latest.getLong("versionCode"));
        if(!activity.getPackageManager().canRequestPackageInstalls()){send(id,action,"result",true,json("state","permission-required","requiresPermission",true,"canInstall",false));return;}
        Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".files",verifiedFile);
        activity.runOnUiThread(()->{
            try{activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));send(id,action,"result",true,json("state","installer-opened"));}
            catch(Exception error){send(id,action,"error",false,json("code","installer-unavailable","message","无法打开系统安装界面，请从发布页下载后手动安装。"));}
        });
    }
    private void openSettings(String id,String action){activity.runOnUiThread(()->{
        try{activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));send(id,action,"result",true,json("state","settings-opened"));}
        catch(Exception error){send(id,action,"error",false,json("code","settings-unavailable","message","请在手机设置中允许此应用安装更新，再返回重试。"));}
    });}
    private void verifyPackage(File file,long expectedCode) throws Exception{
        PackageInfo candidate=activity.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(),signatureFlags());
        if(candidate==null||!activity.getPackageName().equals(candidate.packageName)||versionCode(candidate)!=expectedCode||expectedCode<=versionCode(installed()))throw new UpdateFailure("package-mismatch","安装包与当前应用不匹配，已停止安装。");
        Set<String> a=certificates(candidate),b=certificates(installed());
        if(a.isEmpty()||!a.equals(b))throw new UpdateFailure("signature-mismatch","此安装包与当前版本签名不同，不能直接覆盖安装。请保留原应用和记录，不要直接卸载。");
    }
    private static Set<String> certificates(PackageInfo info) throws Exception{
        Signature[] signatures=Build.VERSION.SDK_INT>=28?(info.signingInfo==null?null:info.signingInfo.getApkContentsSigners()):info.signatures;
        Set<String> result=new HashSet<>();if(signatures!=null)for(Signature s:signatures)result.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));return result;
    }
    private static String fileSha(File file) throws Exception{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[128*1024];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}return hex(digest.digest());}
    private static String hex(byte[] value){StringBuilder result=new StringBuilder();for(byte b:value)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();}
    private static void requireReleaseUrl(String text) throws Exception{URL url=new URL(text);if(!"https".equals(url.getProtocol())||!"github.com".equals(url.getHost())||!url.getPath().startsWith("/"+REPO+"/releases/download/")||url.getUserInfo()!=null)throw new UpdateFailure("untrusted-url","更新地址不属于本应用，已停止下载。");}
    private static HttpURLConnection open(String initial) throws Exception{
        URL current=new URL(initial);
        for(int redirect=0;redirect<6;redirect++){
            String host=current.getHost();if(!"https".equals(current.getProtocol())||current.getUserInfo()!=null||(current.getPort()!=-1&&current.getPort()!=443)||!(host.equals("api.github.com")||host.equals("github.com")||host.equals("release-assets.githubusercontent.com")||host.equals("objects.githubusercontent.com")))throw new UpdateFailure("untrusted-url","更新连接异常，已停止下载。");
            HttpURLConnection connection=(HttpURLConnection)current.openConnection();connection.setConnectTimeout(20000);connection.setReadTimeout(60000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("User-Agent","BaojiBoji-Android-Updater");connection.setRequestProperty("Accept","application/vnd.github+json, application/octet-stream");
            int status=connection.getResponseCode();if(status>=300&&status<400){String location=connection.getHeaderField("Location");connection.disconnect();if(location==null)throw new UpdateFailure("network-error","更新地址没有返回有效文件。");current=new URL(current,location);continue;}
            if(status<200||status>=300){connection.disconnect();throw new UpdateFailure(status==403||status==429?"rate-limit":"network-error",status==403||status==429?"检查次数暂时受限，请稍后再试。":"暂时无法连接更新服务，请稍后重试。");}return connection;
        }
        throw new UpdateFailure("redirect-limit","更新服务重定向过多，请稍后重试。");
    }
    private static String readText(String url,int max) throws Exception{HttpURLConnection connection=open(url);try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[] bytes=new byte[4096];int read;while((read=input.read(bytes))!=-1){if(output.size()+read>max)throw new UpdateFailure("invalid-response","更新信息过大，请稍后重试。");output.write(bytes,0,read);}return new String(output.toByteArray(),StandardCharsets.UTF_8);}finally{connection.disconnect();}}
    private void send(String id,String action,String type,boolean ok,JSONObject data){if(closed)return;JSONObject message=json("id",id,"action",action,"type",type,"ok",ok);try{if(ok)message.put("data",data);else{message.put("code",data.optString("code"));message.put("message",data.optString("message"));}}catch(Exception ignored){}activity.runOnUiThread(()->{if(!closed)listener.onMessage(message);});}
    private static JSONObject json(Object... pairs){JSONObject value=new JSONObject();try{for(int i=0;i<pairs.length;i+=2)value.put((String)pairs[i],pairs[i+1]);}catch(Exception error){throw new IllegalStateException(error);}return value;}
    public void close(){closed=true;executor.shutdownNow();}
    private static final class UpdateFailure extends Exception{final String code;UpdateFailure(String code,String message){super(message);this.code=code;}}
}
