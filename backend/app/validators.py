import re

LOGIN_PATTERN = re.compile(r"^[a-zA-Z0-9_]{3,16}$")
PASSWORD_SPECIALS = frozenset("!@#$%^&*()_-+=")


def login_validation_message(login: str) -> str | None:
    if not LOGIN_PATTERN.fullmatch(login):
        return (
            "Логин: 3–16 символов, только латинские буквы, цифры и подчёркивание."
        )
    return None


def password_validation_message(password: str) -> str | None:
    if len(password) < 10 or len(password) > 16:
        return "Пароль: от 10 до 16 символов."
    if not any(c.islower() for c in password):
        return "Пароль: нужна хотя бы одна строчная буква."
    if not any(c.isupper() for c in password):
        return "Пароль: нужна хотя бы одна заглавная буква."
    if not any(c.isdigit() for c in password):
        return "Пароль: нужна хотя бы одна цифра."
    if not any(c in PASSWORD_SPECIALS for c in password):
        return (
            "Пароль: нужен хотя бы один спецсимвол из набора !@#$%^&*()_-+="
        )
    return None
