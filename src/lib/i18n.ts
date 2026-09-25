import { useSyncExternalStore } from "react";

export type Lang = "uz" | "ru";

/**
 * Translation keyed by the Uzbek source string, gettext-style, rather than by
 * invented ids.
 *
 * The reason is the failure mode. With symbolic keys, a string nobody has
 * translated yet renders as `settings.rowsPerPage` — visibly broken. Here it
 * renders as the Uzbek it already was, which is what this dashboard showed
 * before any of this existed. Translation can then land page by page without
 * a half-finished UI in between.
 */
const RU: Record<string, string> = {
  // ---- shell
  "Admin panel": "Админ-панель",
  MENYU: "МЕНЮ",
  Boshqaruv: "Панель",
  Foydalanuvchilar: "Пользователи",
  "E'lonlar": "Объявления",
  Kategoriyalar: "Категории",
  Xususiyatlar: "Удобства",
  Sharhlar: "Отзывы",
  Izohlar: "Комментарии",
  Shikoyatlar: "Жалобы",
  "Suhbat shikoyatlari": "Жалобы на чаты",
  Sozlamalar: "Настройки",
  Chiqish: "Выйти",

  // ---- common actions
  Ochish: "Открыть",
  "O'chirish": "Удалить",
  Tahrirlash: "Редактировать",
  Saqlash: "Сохранить",
  "Bekor qilish": "Отмена",
  Qidirish: "Поиск",
  Barchasi: "Все",
  "Qayta urinish": "Повторить",
  Yopish: "Закрыть",
  Nusxalash: "Копировать",
  Yana: "Ещё",
  "← Oldingi": "← Назад",
  "Keyingi →": "Вперёд →",
  Sahifada: "На странице",

  // ---- statuses
  Faol: "Активно",
  Qoralama: "Черновик",
  Arxiv: "Архив",
  Arxivlash: "В архив",
  Ochiq: "Открыта",
  "Hal qilindi": "Решено",
  "Rad etildi": "Отклонено",
  "Rad etish": "Отклонить",
  "Qayta ochish": "Открыть снова",

  // ---- listings
  "Eng yangisi birinchi": "Сначала новые",
  "Sarlavha yoki manzil": "Заголовок или адрес",
  "Barcha turlar": "Все типы",
  EGASI: "ВЛАДЕЛЕЦ",
  NARX: "ЦЕНА",
  HOLATI: "СТАТУС",
  SANA: "ДАТА",
  "E'LON": "ОБЪЯВЛЕНИЕ",
  IZOH: "КОММЕНТАРИЙ",
  MUALLIF: "АВТОР",
  Sarlavhasiz: "Без заголовка",
  "Ma'lumotlar": "Данные",
  Holati: "Статус",
  Turi: "Тип",
  Joylashuv: "Расположение",
  Manzil: "Адрес",
  Maydon: "Площадь",
  Xonalar: "Комнаты",
  Qavat: "Этаж",
  "Aloqa telefoni": "Телефон",
  "E'lon qilingan": "Опубликовано",
  Yaratilgan: "Создано",
  Yangilangan: "Обновлено",
  "Ko'rishlar": "Просмотры",
  Baho: "Рейтинг",
  "Sharhlar yo'q": "Отзывов нет",
  Rasmlar: "Фотографии",
  Narxlar: "Цены",
  Tavsif: "Описание",
  Qulayliklar: "Удобства",
  Xarita: "Карта",
  "Sun'iy yo'ldosh": "Спутник",
  "◎ Men qayerdaman": "◎ Где я",
  "⤢ Butun ekran": "⤢ Во весь экран",
  "✕ Yopish": "✕ Закрыть",

  // ---- reviews & comments
  "E'lonlarga qoldirilgan baholar va izohlar": "Оценки и отзывы к объявлениям",
  "E'lonlar ostidagi savol-javoblar": "Вопросы и ответы под объявлениями",
  "Past baho (≤ 2)": "Низкая оценка (≤ 2)",
  Matnli: "С текстом",
  "Izohlar yo'q": "Комментариев нет",
  Javob: "Ответ",
  Suhbat: "Переписка",
  Yoqtirganlar: "Понравилось",
  "E'lonni ochish": "Открыть объявление",
  "E'lon o'chirilgan": "Объявление удалено",
  "— faqat baho": "— только оценка",

  // ---- moderation
  "Foydalanuvchilar e'lonlar haqida yuborgan xabarlar":
    "Сообщения пользователей об объявлениях",
  Sabab: "Причина",
  Shikoyatchi: "Заявитель",
  "Kim yuborgan": "Кто отправил",
  Yozishma: "Переписка",

  // ---- support
  Yordam: "Поддержка",
  "Foydalanuvchilar bilan to'g'ridan-to'g'ri yozishma":
    "Прямая переписка с пользователями",
  Foydalanuvchi: "Пользователь",
  "Oxirgi xabar": "Последнее сообщение",
  Vaqt: "Время",
  Yopilgan: "Закрыта",
  "Javob kutilmoqda": "Ждёт ответа",
  "Murojaatlar yo'q": "Обращений нет",
  "Javob yozing…": "Напишите ответ…",
  Yuborish: "Отправить",
  Jami: "Всего",

  Yangilash: "Обновить",
  Tasdiqlash: "Подтвердить",
  "Bu izoh o'chirilsinmi?": "Удалить этот комментарий?",
  "Bu sharh o'chirilsinmi?": "Удалить этот отзыв?",
  "Buni qaytarib bo'lmaydi.": "Это действие нельзя отменить.",
  "Unga berilgan javoblar ham o'chiriladi.":
    "Ответы на него также будут удалены.",

  Qadalgan: "Закреплено",
  "Qadab qo'yish": "Закрепить",
  "Qadalganni olib tashlash": "Открепить",
  "Javob berish": "Ответить",
  Xabar: "Сообщение",
  "Rasmni ochish": "Открыть фото",
  "Fayl biriktirish": "Прикрепить файл",
  "Ovozli xabar": "Голосовое сообщение",
  "Mikrofonga ruxsat berilmadi": "Нет доступа к микрофону",
  "O'qilgan": "Прочитано",
  Yuborilgan: "Отправлено",

  // ---- user profile
  "Ko'rish": "Просмотр",
  Bloklangan: "Заблокирован",
  Rieltor: "Риелтор",
  Onlayn: "Онлайн",
  Faolligi: "Активность",
  "Yuborgan shikoyatlari": "Отправил жалоб",
  "Kirish usullari": "Способы входа",
  "Ro'yxatdan o'tgan": "Зарегистрирован",
  "Oxirgi faollik": "Последняя активность",

  siz: "вы",
  "Xabar yozish": "Написать сообщение",
  Bloklash: "Заблокировать",
  "Blokdan chiqarish": "Разблокировать",
  "Adminlikdan olish": "Снять админа",

  // ---- settings
  "Til va ko'rinish": "Язык и оформление",
  Til: "Язык",
  "Interfeys tili": "Язык интерфейса",
  Mavzu: "Тема",
  Tizim: "Системная",
  "Yorug'": "Светлая",
  "Qorong'i": "Тёмная",
  Valyuta: "Валюта",
  "Narxlarni ko'rsatish": "Отображение цен",
  "Asl valyutada": "Как в объявлении",
  "Kurs yuklanmadi": "Курс не загружен",
  "Hozircha ma'lumot yo'q": "Пока нет данных",
  "Jadvallar": "Таблицы",
  "Bir sahifadagi qatorlar": "Строк на странице",
  "Tizim holati": "Состояние системы",
  "Markaziy bank kursi": "Курс ЦБ",
  "SMS balansi": "Баланс SMS",
  "Server vaqti": "Время сервера",
  Hisobim: "Мой аккаунт",
  "Sozlamalar shu brauzerda saqlanadi":
    "Настройки сохраняются в этом браузере",
};

const DICTS: Record<Lang, Record<string, string>> = { uz: {}, ru: RU };

const KEY = "growen.admin.lang";

const read = (): Lang => {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "ru" || stored === "uz" ? stored : "uz";
  } catch {
    return "uz";
  }
};

let current: Lang = read();
const subs = new Set<() => void>();

export function setLang(next: Lang) {
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private mode — the choice lasts for this session, which is enough.
  }
  document.documentElement.lang = next;
  subs.forEach((fn) => fn());
}

export function getLang(): Lang {
  return current;
}

/** Translate outside React — table label maps, toast text. */
export function t(source: string): string {
  return DICTS[current][source] ?? source;
}

/** Re-renders the component when the language changes. */
export function useT(): (source: string) => string {
  useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => current,
  );
  return t;
}

export function useLang(): Lang {
  useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => current,
  );
  return current;
}

/** The locale the browser should format dates and numbers in. */
export const localeOf = (lang: Lang) => (lang === "ru" ? "ru-RU" : "uz-UZ");
