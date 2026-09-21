import { NavLink } from 'react-router-dom'
import { Icon } from '@/ui/Icon'
import s from './TabBar.module.css'

/*
 * aria-label у вкладок повторяет видимую подпись, только строчными: слово
 * прописными скринридер норовит прочесть по буквам. Имя обязано совпадать
 * с подписью — иначе голосовая команда «нажми Отчёты» вкладку не найдёт.
 */
export function TabBar({ onAdd }: { onAdd: () => void }) {
  return (
    <nav className={s.wrap} aria-label="Основная навигация">
      <NavLink to="/" viewTransition className={s.tab} aria-label="Сегодня">
        <Icon name="today" size={21} />
        <span className={s.label}>СЕГОДНЯ</span>
      </NavLink>
      <NavLink to="/gym" viewTransition className={s.tab} aria-label="Зал">
        <Icon name="gym" size={21} />
        <span className={s.label}>ЗАЛ</span>
      </NavLink>

      <button className={s.add} onClick={onAdd} aria-label="Добавить еду">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      <NavLink to="/stats" viewTransition className={s.tab} aria-label="Отчёты">
        <Icon name="stats" size={21} />
        <span className={s.label}>ОТЧЁТЫ</span>
      </NavLink>
      <NavLink to="/profile" viewTransition className={s.tab} aria-label="Профиль">
        <Icon name="profile" size={21} />
        <span className={s.label}>ПРОФИЛЬ</span>
      </NavLink>
    </nav>
  )
}
