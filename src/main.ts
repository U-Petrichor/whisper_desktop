import { createApp } from 'vue';
import App from './App.vue';

// ⚠️ 注意：这里引入的是你旧项目的 JS 路由、状态和工具类
import router from './router';
import { hybridStore } from './store/hybrid-store';
import { initSingleLogin } from './utils/single-login';

const app = createApp(App);

// 💡 【TS 核心改造】：声明全局属性的类型
// 告诉 TypeScript，我们在 Vue 实例上挂载了一个叫 $hybridStore 的自定义属性
// 这样你在组件里写 this.$hybridStore 时，TS 就不会报错说找不到这个属性了
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $hybridStore: typeof hybridStore;
  }
}

// 挂载全局属性
app.config.globalProperties.$hybridStore = hybridStore;

app.use(router);

// 初始化单点登录机制
initSingleLogin();

// 启动日志
console.log('🚀 正在启动 Whisper 桌面端应用...');
console.log('💡 本地数据库将在用户登录后初始化');
console.log('🔐 单点登录机制已启用');

app.mount('#app');