package com.devicelock.agent

/** Tanzanian mobile-money numbers, as the customer types them. */
object Msisdn {
    /** 07XXXXXXXX / 06XXXXXXXX, 7XXXXXXXX / 6XXXXXXXX, or 2557XXXXXXXX / 2556XXXXXXXX. */
    fun isValidTz(digits: String): Boolean = Regex("^(255|0)?[67]\\d{8}$").matches(digits)
}
