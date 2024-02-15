#!/usr/bin/env python
# coding: utf-8

# In[1]:


import os
import xarray as xr
import hvplot.xarray
import pandas as pd
import panel as pn
import intake


# In[2]:


Regs = ['gl', 'hn', 'tr', 'hs', 'as']
Exps = ['DTC']
Stats = ['RMSE', 'VIES', 'MEAN']

data = '20230216002023030300'


# In[3]:


#catalog = intake.open_catalog('https://raw.githubusercontent.com/cfbastarz/panel_tests/main/catalog.yml')
catalog = intake.open_catalog('catalog-no_proxy.yml')


# In[ ]:


#ds1 = catalog.scantec_gl_rmse_dtc.to_dask()


# In[ ]:


#ds1


# In[4]:


#Vars = list(ds1.variables)
#Vars.remove('time')
#Vars.remove('lat')
#Vars.remove('lon')

#variable_list = Vars
variable_list = ['pslc000', 'zgeo850']
variable = pn.widgets.Select(name='Variable', value=variable_list[0], options=variable_list)

region = pn.widgets.Select(name='Region', value=Regs[0], options=Regs)
experiment = pn.widgets.Select(name='Experiment', value=Exps[0], options=Exps)
statistic = pn.widgets.Select(name='Statistic', value=Stats[0], options=Stats)

test_list = ['ref_GFS', 'ref_Era5', 'ref_PAnl']
test = pn.widgets.Select(name='Reference', value=test_list[0], options=test_list)

@pn.cache
def loadData(lfname):
    return catalog[lfname].to_dask()

@pn.depends(variable, region, experiment, statistic, test)
def plotFields(variable, region, experiment, statistic, test):
    if test == 'ref_GFS': ttest = 'T1'
    if test == 'ref_Era5': ttest = 'T2'
    if test == 'ref_PAnl': ttest = 'T3'
    lfname = 'scantec_' + region.lower() + '_' + statistic.lower() + '_' + experiment.lower()
    #dfs = catalog[lfname].to_dask()
    dfs = loadData(lfname)
    cmin=dfs[variable].min()
    cmax=dfs[variable].max()
    #cmap='tab20c_r'
    if region == 'as': 
        frame_width=500
    else: 
        frame_width=960
    ax = dfs[variable].hvplot(groupby='time', clim=(cmin, cmax), widget_type='scrubber', widget_location='bottom', 
                              frame_width=frame_width)#, cmap=cmap)
    return pn.Column(ax, sizing_mode='stretch_width')

@pn.depends(variable, region, experiment, statistic, test)
def myName(variable, region, experiment, statistic, test):
    if test == 'ref_GFS': ttest = 'T1'
    if test == 'ref_Era5': ttest = 'T2'
    if test == 'ref_PAnl': ttest = 'T3'
    lfname = 'scantec_' + region.lower() + '_' + statistic.lower() + '_' + experiment.lower()

    return lfname

card_parameters = pn.Card(variable, region, experiment, statistic, test, title='Parameters', collapsed=False)

settings = pn.Column(card_parameters)

pn.template.FastListTemplate(
    site="My Dashboard", title="panel_tests", sidebar=[settings],
    main=["My test.", myName, plotFields], 
#).show();
).servable();


# In[ ]:




