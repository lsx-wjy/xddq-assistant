<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { Eye, EyeOff, KeyRound, LoaderCircle, LogIn, RefreshCw, ShieldCheck, UserRound } from '@lucide/vue'
import companionImage from '@/assets/cultivator-companion.png'
import landscapeImage from '@/assets/xianxia-landscape.png'
import { useServerOptions } from '@/features/users/useServerOptions'
import { useSession } from './useSession'

const { login, loading, error: sessionError } = useSession()
const { options, loading: rolesLoading, error: rolesError, load: loadRoles, reset: resetRoles } = useServerOptions()
const form = reactive({ account: '', password: '', serverId: null as number | null })
const passwordVisible = shallowRef(false)
const submitted = shallowRef(false)
const isAdmin = computed(() => form.account.trim().toLocaleLowerCase() === 'admin')
const credentialsReady = computed(() => form.account.trim().length > 0 && form.password.length > 0)
const canLogin = computed(() => credentialsReady.value && (isAdmin.value || Number(form.serverId) > 0))
const feedback = computed(() => sessionError.value || rolesError.value)

watch([() => form.account, () => form.password], () => {
  form.serverId = null
  resetRoles()
})

async function readRoles() {
  submitted.value = true
  if (!credentialsReady.value || isAdmin.value || rolesLoading.value) return
  await loadRoles(form.account, form.password)
  if (options.value.length === 1) form.serverId = options.value[0].serverId
}

async function submitLogin() {
  submitted.value = true
  if (!credentialsReady.value) return
  if (!isAdmin.value && !options.value.length) {
    await readRoles()
    return
  }
  if (!canLogin.value || loading.value) return
  try {
    await login({
      account: form.account.trim(),
      password: form.password,
      serverId: isAdmin.value ? undefined : Number(form.serverId),
    })
  } catch {
    // The shared session error is rendered below the form.
  }
}
</script>

<template>
  <main class="login-page" :style="{ '--login-landscape': `url(${landscapeImage})` }">
    <section class="login-stage" aria-labelledby="login-title">
      <div class="login-story">
        <div class="brand-seal" aria-hidden="true">
          <span>寻</span>
        </div>
        <p class="eyebrow">XDDQ · 修行控制台</p>
        <h1 id="login-title">一人一境，<br />各归其位。</h1>
        <p class="story-copy">使用游戏平台账号进入自己的角色空间；管理员可查看并管理全部已登录角色。</p>
        <div class="privacy-ribbon">
          <ShieldCheck :size="17" />
          <span>会话使用 HttpOnly 本地凭证，密码不会返回页面</span>
        </div>
        <img class="companion" :src="companionImage" alt="" />
      </div>

      <form class="login-card" @submit.prevent="submitLogin">
        <header>
          <span class="card-kicker">入境凭证</span>
          <h2>{{ isAdmin ? '管理员登录' : '角色登录' }}</h2>
          <p>{{ isAdmin ? '进入完整管理后台' : '验证账号后选择本次进入的角色区服' }}</p>
        </header>

        <label class="login-field">
          <span>平台账号</span>
          <span class="control-wrap">
            <UserRound :size="18" />
            <input v-model.trim="form.account" type="text" autocomplete="username" placeholder="请输入账号" autofocus />
          </span>
        </label>

        <label class="login-field">
          <span>登录密码</span>
          <span class="control-wrap">
            <KeyRound :size="18" />
            <input v-model="form.password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入密码" />
            <button type="button" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
              <EyeOff v-if="passwordVisible" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </span>
        </label>

        <div v-if="!isAdmin" class="role-step">
          <button class="paper-button role-reader" type="button" :disabled="!credentialsReady || rolesLoading" @click="readRoles">
            <LoaderCircle v-if="rolesLoading" :size="17" class="is-spinning" />
            <RefreshCw v-else :size="17" />
            {{ rolesLoading ? '正在验证账号…' : options.length ? '重新读取角色' : '验证账号并读取角色' }}
          </button>
          <label v-if="options.length" class="login-field role-select">
            <span>角色区服</span>
            <select v-model.number="form.serverId">
              <option :value="null" disabled>请选择要进入的角色</option>
              <option v-for="server in options" :key="server.serverId" :value="server.serverId">
                {{ server.serverName }}（ID {{ server.serverId }}）
              </option>
            </select>
          </label>
        </div>

        <p v-if="feedback" class="login-error" role="alert">{{ feedback }}</p>
        <p v-else-if="submitted && !credentialsReady" class="login-error">请填写账号和密码。</p>
        <p v-else-if="submitted && options.length && !form.serverId" class="login-hint">请选择本次要进入的角色区服。</p>

        <button class="jade-button login-submit" type="submit" :disabled="loading || rolesLoading || (options.length > 0 && !canLogin)">
          <LoaderCircle v-if="loading" :size="19" class="is-spinning" />
          <LogIn v-else :size="19" />
          {{ loading ? '正在入境…' : isAdmin ? '进入管理后台' : options.length ? '登录所选角色' : '下一步' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100dvh;
  padding: clamp(20px, 5vw, 64px);
  background:
    linear-gradient(115deg, rgb(242 237 216 / 88%), rgb(225 236 218 / 80%)),
    var(--login-landscape) center / cover fixed;
  place-items: center;
}

.login-stage {
  display: grid;
  grid-template-columns: minmax(310px, 0.92fr) minmax(360px, 0.78fr);
  width: min(100%, 1050px);
  min-height: 630px;
  background: rgb(255 252 239 / 91%);
  border: 1px solid #b79a5c;
  border-radius: 26px;
  box-shadow: 0 30px 90px rgb(36 59 48 / 25%), inset 0 0 0 7px rgb(255 255 255 / 35%);
  overflow: hidden;
}

.login-story {
  position: relative;
  min-height: 630px;
  padding: 68px 54px;
  color: #f2e6bd;
  background:
    radial-gradient(circle at 28% 22%, rgb(103 189 153 / 30%), transparent 30%),
    repeating-linear-gradient(100deg, rgb(255 255 255 / 2%) 0 1px, transparent 1px 8px),
    linear-gradient(155deg, #17483f, #092b2c 78%);
  overflow: hidden;
}

.brand-seal {
  display: grid;
  width: 66px;
  height: 66px;
  color: #163d36;
  font-family: var(--font-display);
  font-size: 35px;
  background: #ddc783;
  border: 5px double #765622;
  border-radius: 50%;
  box-shadow: 0 8px 22px rgb(0 0 0 / 28%);
  place-items: center;
}

.eyebrow,
.card-kicker {
  margin: 28px 0 12px;
  color: #9bdabd;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.login-story h1 {
  position: relative;
  z-index: 2;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(42px, 5vw, 64px);
  font-weight: 700;
  line-height: 1.22;
  letter-spacing: 0.08em;
}

.story-copy {
  position: relative;
  z-index: 2;
  max-width: 390px;
  margin: 24px 0 0;
  color: #c9d8c7;
  font-family: var(--font-serif);
  line-height: 1.9;
}

.privacy-ribbon {
  position: absolute;
  right: 38px;
  bottom: 34px;
  left: 38px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  color: #bfe8d2;
  font-size: 12px;
  background: rgb(4 28 27 / 68%);
  border: 1px solid rgb(213 190 118 / 45%);
  border-radius: 9px;
}

.companion {
  position: absolute;
  right: -50px;
  bottom: 55px;
  width: 340px;
  max-height: 390px;
  object-fit: contain;
  opacity: 0.34;
  filter: saturate(0.8) drop-shadow(0 18px 20px rgb(0 0 0 / 35%));
}

.login-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 58px 56px;
}

.login-card header { margin-bottom: 28px; }
.login-card .card-kicker { margin: 0 0 8px; color: #3d8b75; }
.login-card h2 { margin: 0; color: #342918; font-family: var(--font-display); font-size: 38px; letter-spacing: 0.08em; }
.login-card header p { margin: 8px 0 0; color: #7b7060; font-family: var(--font-serif); font-size: 13px; }

.login-field { display: grid; gap: 7px; margin-bottom: 17px; color: #554a39; font-size: 13px; font-weight: 750; }
.control-wrap { position: relative; display: flex; align-items: center; }
.control-wrap > svg { position: absolute; left: 14px; color: #488c77; }
.control-wrap input,
.role-select select {
  width: 100%;
  min-height: 49px;
  padding: 0 46px;
  color: #30291e;
  font: inherit;
  background: rgb(255 253 245 / 84%);
  border: 1px solid #c9b887;
  border-radius: 9px;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.control-wrap input:focus,
.role-select select:focus { border-color: #3c9a7f; box-shadow: 0 0 0 3px rgb(62 154 127 / 16%); }
.control-wrap button { position: absolute; right: 8px; display: grid; width: 34px; height: 34px; color: #756c5e; background: transparent; border: 0; border-radius: 50%; cursor: pointer; place-items: center; }

.role-step { display: grid; gap: 16px; }
.role-reader { justify-content: center; width: 100%; min-height: 46px; }
.role-select select { padding: 0 13px; }
.login-error,
.login-hint { margin: 0 0 14px; color: #a84031; font-size: 12px; line-height: 1.5; }
.login-hint { color: #8b6a24; }
.login-submit { justify-content: center; width: 100%; min-height: 52px; margin-top: 4px; font-size: 16px; }
.login-submit:disabled,
.role-reader:disabled { opacity: 0.55; transform: none; }
.is-spinning { animation: login-spin 800ms linear infinite; }
@keyframes login-spin { to { transform: rotate(360deg); } }

@media (max-width: 820px) {
  .login-stage { grid-template-columns: 1fr; }
  .login-story { min-height: 270px; padding: 34px; }
  .login-story h1 { font-size: 40px; }
  .story-copy { max-width: 540px; }
  .privacy-ribbon { display: none; }
  .companion { right: 0; bottom: -85px; width: 260px; }
  .login-card { padding: 40px 34px; }
}

@media (max-width: 480px) {
  .login-page { padding: 0; }
  .login-stage { min-height: 100dvh; border: 0; border-radius: 0; }
  .login-story { min-height: 230px; padding: 28px 24px; }
  .story-copy { display: none; }
  .login-card { padding: 34px 24px; }
}
</style>
