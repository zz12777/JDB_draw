// 雲端資料庫設定（Firebase）。這段設定本來就會隨網頁公開，權限由資料庫的安全性規則控管。
export const FIREBASE = {
  apiKey: 'AIzaSyCIO7LlDIzBjSPnuGvI2XdcePWUV6A7QfE',
  authDomain: 'nctu-ttc.firebaseapp.com',
  databaseURL: 'https://nctu-ttc-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'nctu-ttc',
  storageBucket: 'nctu-ttc.firebasestorage.app',
  messagingSenderId: '425980244667',
  appId: '1:425980244667:web:09eaca0e99e9b232442f9e',
};
/** 每一屆用不同的資料夾，隔年改這裡即可重新開始 */
export const ROOT = 't13';
/** 可登入大會台的帳號（實際權限以資料庫規則為準，這裡只用來顯示提示） */
export const ADMINS = ['nctugtt@gmail.com', 'nctuttc@gmail.com'];
/** 公開頁每隔幾秒更新一次 */
export const POLL_SECONDS = 15;
