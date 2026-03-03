import axios from 'axios';

const NEIS_BASE_URL = 'https://open.neis.go.kr/hub';

export interface NeisMeal {
  MLSV_YMD: string;
  DDISH_NM: string;
  ORPLC_INFO: string;
  CAL_INFO: string;
  NTR_INFO: string;
}

export interface NeisSchedule {
  AA_YMD: string;
  EVENT_NM: string;
  EVENT_CNTNT: string;
}

export class NeisService {
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async getMeals(officeCode: string, schoolCode: string, date: string): Promise<NeisMeal[]> {
    try {
      const response = await axios.get(`${NEIS_BASE_URL}/mealServiceDietInfo`, {
        params: {
          KEY: this.apiKey,
          Type: 'json',
          ATPT_OFCDC_SC_CODE: officeCode,
          SD_SCHUL_CODE: schoolCode,
          MLSV_YMD: date,
        }
      });

      if (response.data.mealServiceDietInfo) {
        return response.data.mealServiceDietInfo[1].row;
      }
      return [];
    } catch (error) {
      console.error('Error fetching meals from NEIS:', error);
      return [];
    }
  }

  async getSchedules(officeCode: string, schoolCode: string, startDate: string, endDate: string): Promise<NeisSchedule[]> {
    try {
      const response = await axios.get(`${NEIS_BASE_URL}/SchoolSchedule`, {
        params: {
          KEY: this.apiKey,
          Type: 'json',
          ATPT_OFCDC_SC_CODE: officeCode,
          SD_SCHUL_CODE: schoolCode,
          AA_FROM_YMD: startDate,
          AA_TO_YMD: endDate,
        }
      });

      if (response.data.SchoolSchedule) {
        return response.data.SchoolSchedule[1].row;
      }
      return [];
    } catch (error) {
      console.error('Error fetching schedules from NEIS:', error);
      return [];
    }
  }
}

export const neisService = new NeisService(process.env.NEIS_API_KEY);
