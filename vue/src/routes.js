import { createRouter, createWebHashHistory } from "vue-router";
import Home from "./components/Home.vue";
import NotePage from "./components/NotePage.vue";
import Compose from "./components/Compose.vue";
import TodoPage from "./components/TodoPage.vue";
import Note from "./components/Note.vue";
import RegLog from "./components/registerLogin.vue";

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {path: '/', component: Home},
        {path: '/create', component: Compose},
        {path: '/showNote', component: NotePage},
        {path: '/showTodo', component: TodoPage},
        {path: '/note/:id', component: Note, props: true},
        {path: '/login',component: RegLog}
    ]
});

export default router;