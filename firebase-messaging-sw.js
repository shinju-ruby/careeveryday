// 手機通知用的背景程式（Firebase 推播）。通知內容由 Email 提醒程式送出，這裡負責在背景顯示。
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyBzlR9n_bXVeHzm4mn1NTRqsA3PSwL0oqA",
  authDomain: "careeveryday-c49fc.firebaseapp.com",
  projectId: "careeveryday-c49fc",
  storageBucket: "careeveryday-c49fc.firebasestorage.app",
  messagingSenderId: "70270100203",
  appId: "1:70270100203:web:6171f0514163cdf6d3d4ae"
});
firebase.messaging();
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for(const c of list){ if('focus' in c) return c.focus(); }
    return clients.openWindow('./');
  }));
});
