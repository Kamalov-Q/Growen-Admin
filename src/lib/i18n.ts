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
  // ---- map search
  // Qidirish and Tozalash are not here: keys are the Uzbek source string, so
  // they are the same key as the common actions further down, and a second
  // entry is a duplicate property rather than a map-specific translation.
  "Tuman, bekat yoki manzil": "Район, станция или адрес",
  "Xaritadan qidirish": "Поиск по карте",
  "Bunday joy topilmadi": "Такое место не найдено",
  "Qidiruv ishlamadi — keyinroq urinib ko'ring": "Поиск не сработал — попробуйте позже",

  // ---- shell
  "Admin panel": "Админ-панель",
  MENYU: "МЕНЮ",
  Boshqaruv: "Панель",
  Foydalanuvchilar: "Пользователи",
  "E'lonlar": "Объявления",
  Kategoriyalar: "Категории",
  Xususiyatlar: "Удобства",
  Tariflar: "Тарифы",
  Sharhlar: "Отзывы",
  Izohlar: "Комментарии",
  Shikoyatlar: "Жалобы",
  Fikrlar: "Отзывы и комментарии",
  "E'lon shikoyatlari": "Жалобы на объявления",
  "Hikoya shikoyatlari": "Жалобы на истории",
  "Suhbat shikoyatlari": "Жалобы на чаты",
  Sozlamalar: "Настройки",
  Chiqish: "Выйти",
  "Chiqishni tasdiqlaysizmi?": "Выйти из аккаунта?",
  "Hisobingizdan chiqasiz.": "Вы выйдете из своего аккаунта.",

  // ---- tariffs
  "Pullik amallar narxi va hisobni to'ldirish bonuslari": "Цены платных действий и бонусы за пополнение",
  "Pullik amallar": "Платные действия",
  "+ Yangi tarif": "+ Новый тариф",
  "Boshqa — o'z tarifim": "Другое — свой тариф",
  "Tarif kodi": "Код тарифа",
  "Muddati (kun, ixtiyoriy)": "Срок (дней, необязательно)",
  "Lotin harflari, raqam va _ — kamida 2 ta belgi": "Латинские буквы, цифры и _ — минимум 2 символа",
  "Bu kod band — ro'yxatdan tanlang": "Этот код занят — выберите из списка",
  "O'z tarifingiz ilovada ro'yxatda ko'rinadi, lekin uni sotadigan funksiya qo'shilmaguncha pul yechilmaydi.":
    "Свой тариф виден в приложении в списке, но деньги по нему не списываются, пока не добавлена функция, которая его продаёт.",
  "Yangi tarif": "Новый тариф",
  Tarif: "Тариф",
  "Tarif qo'shildi": "Тариф добавлен",
  "Tarif o'chirildi": "Тариф удалён",
  "Tarifni o'chirasizmi?": "Удалить тариф?",
  "Foydalanuvchilar bu tarifni sotib ola olmaydi.": "Пользователи больше не смогут купить этот тариф.",
  "Bu amal bepul bo'lib qoladi.": "Это действие станет бесплатным.",
  "Hozir barcha amallar bepul. Birinchi tarifni qo'shing.": "Сейчас все действия бесплатны. Добавьте первый тариф.",
  "Qaysi amal uchun": "Для какого действия",
  "E'lon joylash": "Размещение объявления",
  "Hikoya joylash": "Публикация истории",
  "TOPga chiqarish": "Поднятие в ТОП",
  "O'chirilgan": "Выключен",
  "Bir nechta tarif bo'lishi mumkin — har xil muddatga, foydalanuvchi o'zi tanlaydi.":
    "Тарифов может быть несколько — на разный срок, пользователь выбирает сам.",
  "Bu amal uchun bitta tarif bo'ladi — amal bajarilganda shu narx yechiladi.":
    "Для этого действия один тариф — его цена списывается при выполнении действия.",
  "o'chirilsa, bu tarif sotuvdan olinadi": "если выключить, тариф снимается с продажи",
  "To'ldirish bonuslari": "Бонусы за пополнение",
  Amal: "Действие",
  Kalit: "Ключ",
  Narxi: "Цена",
  Muddati: "Срок",
  kun: "дн.",
  Bepul: "Бесплатно",
  "Pullik": "Платно",
  "O'chirilsa, bu amal bepul bo'ladi": "Если выключить, действие станет бесплатным",
  "Nomi (o'zbekcha)": "Название (узбекский)",
  "Nomi (ruscha)": "Название (русский)",
  "Narxi (so'm)": "Цена (сум)",
  "Muddati (kun)": "Срок (дней)",
  "Kamida 2 ta belgi": "Минимум 2 символа",
  "0 yoki undan katta butun son": "Целое число от 0",
  "1 dan 365 gacha butun son": "Целое число от 1 до 365",
  "Pullik amal": "Платное действие",
  "o'chirilsa, foydalanuvchilardan pul yechilmaydi": "если выключить, деньги с пользователей не списываются",
  "ilova shu kalit bo'yicha pul yechadi, shuning uchun o'zgarmaydi": "приложение списывает деньги по этому ключу, поэтому он не меняется",
  "Narx 0 bo'lsa ham amal bepul bo'ladi.": "При цене 0 действие тоже бесплатно.",
  "Yangi narx va muddat faqat keyingi to'lovlarga ta'sir qiladi.": "Новые цена и срок действуют только на следующие оплаты.",
  Saqlandi: "Сохранено",
  "Saqlanmoqda...": "Сохранение...",
  "+ Yangi pog'ona": "+ Новая ступень",
  "Yangi pog'ona": "Новая ступень",
  "Pog'onani tahrirlash": "Изменить ступень",
  "Pog'ona qo'shildi": "Ступень добавлена",
  "Pog'ona o'chirildi": "Ступень удалена",
  "Pog'onani o'chirasizmi?": "Удалить ступень?",
  "Shu summadan boshlab to'ldirganlar bonus olmay qo'yadi.": "Пополнения от этой суммы перестанут получать бонус.",
  "To'ldirish summasi (dan)": "Сумма пополнения (от)",
  Bonus: "Бонус",
  Misol: "Пример",
  "Eng kam summa (so'm)": "Минимальная сумма (сум)",
  "Bonus (%)": "Бонус (%)",
  "1 000 dan 10 000 000 gacha butun son": "Целое число от 1 000 до 10 000 000",
  "0 dan 100 gacha butun son": "Целое число от 0 до 100",
  "Bonus pog'onalari yo'q": "Бонусных ступеней нет",
  "To'ldirishlarga bonus berilmaydi. Birinchisini qo'shing.": "Бонусы за пополнение не начисляются. Добавьте первую.",
  "Foydalanuvchi hisobini to'ldirganda summaga qarab qo'shimcha bonus oladi — eng katta mos pog'ona qo'llanadi.":
    "При пополнении пользователь получает бонус в зависимости от суммы — применяется наибольшая подходящая ступень.",
  "Bonus beriladi": "Бонус начисляется",
  "Bonus berilmaydi": "Бонус не начисляется",
  "Tariflar yo'q": "Тарифов нет",
  "Server birinchi ishga tushganda yaratiladi.": "Создаются при первом запуске сервера.",

  // ---- billing & payments
  "To'lovlar": "Платежи",
  "To'lovlar va Hamyonlar": "Платежи и кошельки",
  "Click, Payme, Paynet to'lovlari jurnali va foydalanuvchilar balanslari":
    "Журнал платежей Click, Payme, Paynet и балансы пользователей",
  "To'lovlar jurnali": "Журнал платежей",
  "Foydalanuvchi hamyonlari": "Кошельки пользователей",
  "Balansni o'zgartirish": "Изменить баланс",
  "Hisobga qo'shish": "Пополнить счёт",
  "Hisobdan yechish": "Списать со счёта",
  "Batafsil": "Подробнее",
  "To'langan": "Оплачено",
  "Jarayonda": "В процессе",
  "Bekor qilingan": "Отменён",
  "Barcha tizimlar": "Все системы",

  // ---- manual adjustments (audit trail)
  "Qo'lda o'zgartirishlar": "Ручные корректировки",
  Tarix: "История",
  "Qo'shilgan": "Пополнения",
  Yechilgan: "Списания",
  "Boshqa filtrlarni tanlab ko'ring.": "Попробуйте другие фильтры.",
  "Filtrni olib tashlash": "Сбросить фильтр",
  "Bunday o'zgartirishlar topilmadi": "Таких корректировок не найдено",
  "Hali qo'lda o'zgartirishlar bo'lmagan": "Ручных корректировок ещё не было",
  "Hamyon balansi qo'lda o'zgartirilsa, shu yerda qoladi.":
    "Как только баланс изменят вручную, запись останется здесь.",

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
  Sotuvchi: "Продавец",
  "Ta'mirlash": "Ремонт",
  "Remont talab": "Требует ремонта",
  "O'rtacha": "Средний",
  Kosmetik: "Косметический",
  Yevroremont: "Евроремонт",
  Dizaynerlik: "Дизайнерский",
  "Kapital ta'mir": "Капитальный",
  "Bino turi": "Тип здания",
  Mulkdor: "Собственник",
  "Yangi bino": "Новостройка",
  Ikkilamchi: "Вторичка",
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

  // ---- listing editor
  "+998 va 9 ta raqam: +998901234567": "+998 и 9 цифр: +998901234567",
  "-10 dan 200 gacha butun son": "Целое число от -10 до 200",
  "0 dan katta butun son": "Целое число больше 0",
  "0 dan katta son": "Число больше 0",
  "1 dan 200 gacha butun son": "Целое число от 1 до 200",
  "10 MB gacha": "до 10 МБ",
  "3 xonali kvartira, Chorsu yaqinida": "3-комнатная квартира у Чорсу",
  "Asl holiga qaytarish": "Вернуть как было",
  Asosiy: "Основное",
  "Barcha o'zgarishlar saqlangan": "Все изменения сохранены",
  "Birinchi rasm — muqova. Tartibni sudrab o'zgartiring.": "Первое фото — обложка. Порядок меняется перетаскиванием.",
  "Bo'limlar": "Разделы",
  "Bo'sh qator — yangi xatboshi": "Пустая строка — новый абзац",
  "Bosing — o'chirish, torting — surish": "Нажмите — удалить, тяните — переместить",
  "Brauzer joylashuvni qo'llab-quvvatlamaydi": "Браузер не поддерживает геолокацию",
  "Bu kategoriyada ba'zi maydonlar so'ralmaydi va ilovada ko'rsatilmaydi.": "В этой категории некоторые поля не используются и не показываются в приложении.",
  Burchaklar: "Углы",
  "Burchakni sudrab suring, bosib o'chiring; yangi burchak uchun xaritaga bosing.": "Тяните угол, чтобы сдвинуть, нажмите — чтобы удалить; для нового угла нажмите на карту.",
  "Butun ekran": "Во весь экран",
  Chapga: "Влево",
  Chegara: "Граница",
  "Chegara uchun kamida 3 ta nuqta kerak": "Для границы нужно минимум 3 точки",
  "Chegaraning burchaklarini ketma-ket bosing (kamida 3 ta).": "Нажимайте углы границы по порядку (минимум 3).",
  "Chizilgan maydon": "Площадь по границе",
  "E'lon": "Объявление",
  "E'lon arxivlandi": "Объявление архивировано",
  "E'lon bir nechta maqsadda bo'lishi mumkin — masalan, ham sotuv, ham ijara. Har biriga bitta narx.": "Объявление может быть сразу для продажи и аренды. Для каждой цели — одна цена.",
  "E'lon faollashtirildi": "Объявление активировано",
  "E'longa qaytish": "К объявлению",
  "E'lonni arxivlash": "Архивировать объявление",
  "E'lon xaritadan va lentadan olib tashlanadi. Yozuv saqlanib qoladi va keyinroq faollashtirish mumkin.": "Объявление исчезнет с карты и из ленты. Запись сохранится, её можно будет снова активировать.",
  Egasi: "Владелец",
  Faollashtirish: "Активировать",
  "ID nusxalandi": "ID скопирован",
  "ID nusxalash": "Скопировать ID",
  "Joylashuvga ruxsat berilmadi": "Доступ к геолокации запрещён",
  "Joylashuvni aniqlab bo'lmadi": "Не удалось определить местоположение",
  "Joylashuvni belgilang": "Укажите местоположение",
  "Kamida bitta narx kerak": "Нужна хотя бы одна цена",
  Kategoriya: "Категория",
  "Kategoriyani tanlang": "Выберите категорию",
  Kichraytirish: "Свернуть",
  "Ko'pi bilan": "Не более",
  "Ko'pi bilan 160 ta belgi": "Не более 160 символов",
  "Ko'pi bilan 500 ta belgi": "Не более 500 символов",
  "Ko'pi bilan 5000 ta belgi": "Не более 5000 символов",
  Koordinatalar: "Координаты",
  "Kunlik ijara": "Посуточная аренда",
  "Manzil va aloqa": "Адрес и контакты",
  "Maydon, m²": "Площадь, м²",
  "Maydonga yozish": "Записать в площадь",
  "Men qayerdaman": "Где я",
  "Mening joylashuvim": "Моё местоположение",
  Muqova: "Обложка",
  "Muqova qilish": "Сделать обложкой",
  Narx: "Цена",
  "Narxni kiriting": "Введите цену",
  Nuqta: "Точка",
  "O'ngga": "Вправо",
  "O'zgartirilgan": "Изменено",
  "Oxirgisini qaytarish": "Убрать последний",
  "Oylik ijara": "Помесячная аренда",
  "Pinni sudrab yoki xaritaga bosib joyini o'zgartiring.": "Перетащите метку или нажмите на карту, чтобы её переместить.",
  "Qavat qavatlar sonidan katta bo'lmasin": "Этаж не может быть выше этажности",
  "Qavatlar soni": "Этажность",
  Qolish: "Остаться",
  "Rasmlar yo'q": "Нет фото",
  "Rasmlarni shu yerga tashlang": "Перетащите фото сюда",
  "Rasmni o'chirish": "Удалить фото",
  "Ro'yxat Xususiyatlar sahifasida boshqariladi.": "Список настраивается на странице «Удобства».",
  "Saqlaganingizdan so'ng rasm butunlay o'chiriladi.": "После сохранения фото будет удалено навсегда.",
  "Saqlanmagan o'zgarishlar": "Несохранённые изменения",
  Sarlavha: "Заголовок",
  "Sarlavhasiz e'lon": "Объявление без заголовка",
  Sotuv: "Продажа",
  Tanlangan: "Выбрано",
  "Telefon yo'q": "Нет телефона",
  "Toshkent, Shayxontohur tumani, Navoiy ko'chasi 12": "Ташкент, Шайхантахурский район, ул. Навои 12",
  Tozalash: "Очистить",
  "UZS so'm": "UZS сум",
  Umumiy: "Обзор",
  "Xarita turi": "Тип карты",
  "Xaritaga bosib pin qo'ying.": "Нажмите на карту, чтобы поставить метку.",
  "Xato bor": "Есть ошибка",
  "Yopsangiz, kiritilgan o'zgarishlar yo'qoladi.": "Если закрыть, внесённые изменения пропадут.",
  Yuklanmoqda: "Загрузка",
  "e'londa": "в объявлении",
  "kompyuterdan tanlang": "выберите на компьютере",
  kuniga: "в сутки",
  "o'chirilgan": "удалено",
  oyiga: "в месяц",
  "ta rasm": "фото",
  "ta rasm 10 MB dan katta": "фото больше 10 МБ",
  "ta rasmni yuklab bo'lmadi": "фото не удалось загрузить",
  yashirin: "скрыта",
  yoki: "или",
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
